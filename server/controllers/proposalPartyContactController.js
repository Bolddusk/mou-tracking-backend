const pool = require('../config/db');
const {
  checkProposalAccess,
  buildProposalCapabilities,
  sectorLeadCanAccessProposal,
} = require('../utils/proposalAccess');
const { enrichProposalRow } = require('../utils/proposalTemplate');
const { attachPokeStatus } = require('../utils/pokeStatus');
const { provisionPartyBForProposal } = require('../utils/partyBProvisioner');
const { provisionPartyAForProposal } = require('../utils/partyAProvisioner');
const { sectorLeadHasAnySector } = require('../utils/sectorLeadAssignments');
const { logProposalUpdates } = require('../utils/proposalChangeLog');
const { normalizeEmail, isValidLoginEmail } = require('../utils/emailNormalize');
const { buildPartyBContactUpdates } = require('../utils/partyBInfo');

const PARTY_A_INFO_FIELDS = [
  'entity_type',
  'organization_name',
  'department_ministry',
  'contact_name',
  'designation',
  'email',
  'phone',
  'country',
  'city',
];

function parsePartyAInfo(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function verifyPartyContactEditAccess(req, proposal) {
  if (!proposal) {
    return { error: 'Proposal not found', status: 404 };
  }

  if (proposal.status === 'draft') {
    return { error: 'Party contact details cannot be edited on draft proposals', status: 400 };
  }

  if (req.user.role === 'super_admin' || req.user.role === 'admin') {
    return {
      ok: true,
      proposal,
      canEditPartyA: true,
      canEditPartyB: true,
    };
  }

  if (req.user.role === 'sector_lead') {
    if (!sectorLeadHasAnySector(req.user)) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    const slAccess = await sectorLeadCanAccessProposal(req, proposal);
    if (!slAccess.ok) {
      return { error: 'Access denied — wrong sector', status: 403 };
    }
    return {
      ok: true,
      proposal,
      viaMatchmaking: slAccess.viaMatchmaking,
      canEditPartyA: true,
      canEditPartyB: true,
    };
  }

  if (
    req.user.role === 'party_a' &&
    Number(proposal.party_a_id) === Number(req.user.id)
  ) {
    return {
      ok: true,
      proposal,
      canEditPartyA: true,
      canEditPartyB: false,
    };
  }

  if (
    req.user.role === 'party_b' &&
    Number(proposal.party_b_user_id) === Number(req.user.id)
  ) {
    return {
      ok: true,
      proposal,
      canEditPartyA: false,
      canEditPartyB: true,
    };
  }

  return { error: 'Access denied', status: 403 };
}

function buildPartyContactUpdates(body, existingProposal, scope = {}) {
  const canEditPartyA = scope.canEditPartyA !== false;
  const canEditPartyB = scope.canEditPartyB !== false;
  const updates = {};
  const existingPartyAInfo = parsePartyAInfo(existingProposal.party_a_info);
  const nextPartyAInfo = { ...existingPartyAInfo };

  const wantsPartyA =
    body.party_a_info && typeof body.party_a_info === 'object';
  const wantsPartyB =
    (body.party_b_info && typeof body.party_b_info === 'object') ||
    body.party_b_email !== undefined ||
    body.party_b_name !== undefined ||
    body.party_b_phone !== undefined;

  if (wantsPartyA && !canEditPartyA) {
    return { error: 'You cannot edit Party A contacts', status: 403 };
  }
  if (wantsPartyB && !canEditPartyB) {
    return { error: 'You cannot edit Party B contacts', status: 403 };
  }

  if (wantsPartyA && canEditPartyA) {
    PARTY_A_INFO_FIELDS.forEach((key) => {
      if (body.party_a_info[key] !== undefined) {
        let value =
          body.party_a_info[key] === null ? '' : String(body.party_a_info[key]).trim();
        if (key === 'email' && value) {
          value = normalizeEmail(value);
        }
        nextPartyAInfo[key] = value;
      }
    });
    updates.party_a_info = JSON.stringify(nextPartyAInfo);

    if (body.party_a_info.organization_name !== undefined && nextPartyAInfo.organization_name) {
      updates.company_name = nextPartyAInfo.organization_name;
    }
  }

  let partyBResult = null;
  if (canEditPartyB) {
    partyBResult = buildPartyBContactUpdates(body, existingProposal);
    if (partyBResult) {
      Object.assign(updates, partyBResult.updates);
    }
  }

  const partyAEmail = nextPartyAInfo.email || '';
  if (wantsPartyA && partyAEmail && !isValidLoginEmail(partyAEmail)) {
    return {
      error: 'Invalid Party A email address — use a real email (e.g. name@domain.com)',
      status: 400,
    };
  }

  const partyBEmail =
    partyBResult?.nextInfo?.email ||
    (body.party_b_email !== undefined ? normalizeEmail(body.party_b_email) : null);
  if (partyBEmail && !isValidLoginEmail(partyBEmail)) {
    return {
      error: 'Invalid Party B email address — use a real email (e.g. name@domain.com)',
      status: 400,
    };
  }

  return { updates, nextPartyAInfo, nextPartyBInfo: partyBResult?.nextInfo || null };
}

async function getProposalRow(proposalId) {
  const [rows] = await pool.query('SELECT * FROM proposals WHERE id = ?', [proposalId]);
  return rows[0] || null;
}

async function updateProposalPartyContacts(req, res) {
  try {
    const proposal = await getProposalRow(req.params.id);
    const access = await verifyPartyContactEditAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const built = buildPartyContactUpdates(req.body, proposal, {
      canEditPartyA: access.canEditPartyA,
      canEditPartyB: access.canEditPartyB,
    });
    if (built.error) {
      return res.status(built.status).json({ error: built.error });
    }

    const { updates } = built;
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No party contact fields provided' });
    }

    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ');
    await pool.query(`UPDATE proposals SET ${setClause} WHERE id = ?`, [
      ...Object.values(updates),
      req.params.id,
    ]);

    await logProposalUpdates({
      proposalId: req.params.id,
      user: req.user,
      action: 'party_contacts_updated',
      beforeRow: proposal,
      updates,
    });

    let partyAResult = null;
    let partyBResult = null;
    const updatedProposal = await getProposalRow(req.params.id);
    const provisionableStatuses = ['approved', 'submitted', 'resubmitted', 'completed'];

    if (updates.party_a_info && provisionableStatuses.includes(updatedProposal.status)) {
      partyAResult = await provisionPartyAForProposal(updatedProposal);
    }

    if (
      (updates.party_b_info || updates.party_b_email) &&
      provisionableStatuses.includes(updatedProposal.status)
    ) {
      partyBResult = await provisionPartyBForProposal(updatedProposal);
    }

    const enriched = enrichProposalRow(await getProposalRow(req.params.id));
    const detailAccess = await checkProposalAccess(req, enriched);
    const [withPoke] = await attachPokeStatus([enriched]);

    return res.json({
      message: 'Party contact details updated successfully',
      proposal: withPoke,
      capabilities: buildProposalCapabilities(req, enriched, detailAccess),
      party_a: partyAResult,
      party_b: partyBResult,
    });
  } catch (err) {
    console.error('Update proposal party contacts error:', err.message);
    return res.status(500).json({ error: 'Failed to update party contact details' });
  }
}

module.exports = { updateProposalPartyContacts };

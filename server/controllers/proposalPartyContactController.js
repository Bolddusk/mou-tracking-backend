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

const PARTY_B_FIELDS = [
  'party_b_name',
  'party_b_organization',
  'party_b_email',
  'party_b_phone',
  'party_b_country',
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

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

async function verifyPartyContactEditAccess(req, proposal) {
  if (!proposal) {
    return { error: 'Proposal not found', status: 404 };
  }

  if (proposal.status === 'draft') {
    return { error: 'Party contact details cannot be edited on draft proposals', status: 400 };
  }

  if (req.user.role === 'super_admin') {
    return { ok: true, proposal };
  }

  if (req.user.role === 'sector_lead') {
    if (!sectorLeadHasAnySector(req.user)) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    const slAccess = await sectorLeadCanAccessProposal(req, proposal);
    if (!slAccess.ok) {
      return { error: 'Access denied — wrong sector', status: 403 };
    }
    return { ok: true, proposal, viaMatchmaking: slAccess.viaMatchmaking };
  }

  return { error: 'Access denied', status: 403 };
}

function buildPartyContactUpdates(body, existingProposal) {
  const updates = {};
  const existingPartyAInfo = parsePartyAInfo(existingProposal.party_a_info);
  const nextPartyAInfo = { ...existingPartyAInfo };

  if (body.party_a_info && typeof body.party_a_info === 'object') {
    PARTY_A_INFO_FIELDS.forEach((key) => {
      if (body.party_a_info[key] !== undefined) {
        nextPartyAInfo[key] =
          body.party_a_info[key] === null ? '' : String(body.party_a_info[key]).trim();
      }
    });
    updates.party_a_info = JSON.stringify(nextPartyAInfo);

    if (body.party_a_info.organization_name !== undefined && nextPartyAInfo.organization_name) {
      updates.company_name = nextPartyAInfo.organization_name;
    }
  }

  PARTY_B_FIELDS.forEach((key) => {
    if (body[key] !== undefined) {
      updates[key] = body[key] === null ? null : String(body[key]).trim();
    }
  });

  if (body.party_b_email !== undefined && body.party_b_email && !isValidEmail(body.party_b_email)) {
    return { error: 'Invalid Party B email address', status: 400 };
  }

  if (
    body.party_a_info?.email !== undefined &&
    body.party_a_info.email &&
    !isValidEmail(body.party_a_info.email)
  ) {
    return { error: 'Invalid Party A email address', status: 400 };
  }

  return { updates, nextPartyAInfo };
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

    const built = buildPartyContactUpdates(req.body, proposal);
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

    let partyAResult = null;
    let partyBResult = null;
    const updatedProposal = await getProposalRow(req.params.id);
    const provisionableStatuses = ['approved', 'submitted', 'resubmitted', 'completed'];

    if (updates.party_a_info && provisionableStatuses.includes(updatedProposal.status)) {
      partyAResult = await provisionPartyAForProposal(updatedProposal);
    }

    if (updates.party_b_email && provisionableStatuses.includes(updatedProposal.status)) {
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

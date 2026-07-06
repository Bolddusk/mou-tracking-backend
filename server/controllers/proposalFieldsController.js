const pool = require('../config/db');
const {
  checkProposalAccess,
  buildProposalCapabilities,
  canEditProposalFields,
} = require('../utils/proposalAccess');
const { enrichProposalRow } = require('../utils/proposalTemplate');
const { attachPokeStatus } = require('../utils/pokeStatus');
const { loadUserPermissions } = require('../utils/rolePermissions');
const { ensureSectorCache, getActiveSectorNames } = require('../utils/sectorRegistry');
const { ensureConferenceCache, listActiveConferences } = require('../utils/conferenceRegistry');
const { ensureSifcCategoryCache, listActiveSifcCategories } = require('../utils/sifcCategoryRegistry');
const {
  buildProposalFieldUpdates,
  getEditableFieldCatalog,
  canChangeProposalSector,
} = require('../utils/proposalFieldEdit');
const { provisionPartyBForProposal } = require('../utils/partyBProvisioner');
const { provisionPartyAForProposal } = require('../utils/partyAProvisioner');
const {
  loadPartyAProfileSnapshot,
  loadPartyBProfileSnapshot,
} = require('../utils/partyProfileSnapshots');
const { logProposalUpdates } = require('../utils/proposalChangeLog');

async function getProposalRow(proposalId) {
  const [rows] = await pool.query('SELECT * FROM proposals WHERE id = ?', [proposalId]);
  return rows[0] || null;
}

async function getProposalEditableFields(req, res) {
  try {
    await ensureSectorCache();
    await ensureConferenceCache();
    await ensureSifcCategoryCache();
    const proposal = await getProposalRow(req.params.id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const edit = canEditProposalFields(req, proposal, access);
    const catalog = getEditableFieldCatalog();
    const [conferences, sifcCategories] = await Promise.all([
      listActiveConferences(),
      listActiveSifcCategories(),
    ]);

    const canChangeSector = canChangeProposalSector(req.user);

    return res.json({
      proposal_id: Number(req.params.id),
      editable: edit.ok,
      locked: Boolean(edit.locked),
      reason: edit.ok ? null : edit.error,
      catalog,
      can_change_sector: canChangeSector,
      sectors: edit.ok && canChangeSector ? getActiveSectorNames() : [],
      conferences: edit.ok ? conferences : [],
      sifc_categories: edit.ok ? sifcCategories : [],
    });
  } catch (err) {
    console.error('Get proposal editable fields error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch editable field catalog' });
  }
}

async function updateProposalFields(req, res) {
  try {
    await ensureSectorCache();
    await ensureConferenceCache();
    await ensureSifcCategoryCache();
    const proposal = await getProposalRow(req.params.id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const edit = canEditProposalFields(req, proposal, access);
    if (!edit.ok) {
      return res.status(edit.status).json({ error: edit.error });
    }

    const built = buildProposalFieldUpdates(req.body, proposal, req.user);
    if (built.error) {
      return res.status(built.status).json({ error: built.error });
    }

    const { updates } = built;
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No editable fields provided' });
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
      action: 'fields_updated',
      beforeRow: proposal,
      updates,
    });

    const updated = await getProposalRow(req.params.id);
    const provisionableStatuses = ['approved', 'submitted', 'resubmitted', 'completed'];

    let partyAResult = null;
    let partyBResult = null;

    if (
      (updates.party_a_info || updates.company_name) &&
      provisionableStatuses.includes(updated.status)
    ) {
      partyAResult = await provisionPartyAForProposal(updated);
    }

    if (updates.party_b_email && provisionableStatuses.includes(updated.status)) {
      partyBResult = await provisionPartyBForProposal(updated);
    }

    const enriched = enrichProposalRow(updated);
    const [withPoke] = await attachPokeStatus([enriched]);
    const detailAccess = await checkProposalAccess(req, enriched);
    const userPermissions = await loadUserPermissions(req.user);
    const [partyAProfile, partyBProfile] = await Promise.all([
      loadPartyAProfileSnapshot(req.user, enriched.party_a_id, enriched),
      loadPartyBProfileSnapshot(req.user, enriched.party_b_user_id, enriched),
    ]);

    return res.json({
      message: 'Proposal fields updated successfully',
      proposal: withPoke,
      capabilities: buildProposalCapabilities(req, enriched, detailAccess, userPermissions),
      party_a_profile: partyAProfile,
      party_b_profile: partyBProfile,
      party_a: partyAResult,
      party_b: partyBResult,
      updated_fields: Object.keys(updates),
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'external_reference must be unique' });
    }
    console.error('Update proposal fields error:', err.message);
    return res.status(500).json({ error: 'Failed to update proposal fields' });
  }
}

module.exports = {
  getProposalEditableFields,
  updateProposalFields,
};

const pool = require('../config/db');
const {
  sectorLeadCoversSector,
  sectorLeadHasAnySector,
  getSectorLeadScopedSectors,
} = require('./sectorLeadAssignments');

async function getPartyAUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, full_name, email, role, organization, phone, created_at
     FROM users WHERE id = ?`,
    [userId]
  );
  const user = rows[0];
  if (!user || user.role !== 'party_a') return null;
  return user;
}

async function partyAHasProposalInSector(partyAId, sector) {
  const [[legacy]] = await pool.query(
    `SELECT COUNT(*) AS count FROM proposals
     WHERE party_a_id = ? AND sector = ? AND status != 'draft'`,
    [partyAId, sector]
  );
  if (legacy.count > 0) return true;

  const [[matchmaking]] = await pool.query(
    `SELECT COUNT(*) AS count FROM mm_proposals
     WHERE submitted_by = ? AND side = 'side_a' AND sector = ? AND status != 'draft'`,
    [partyAId, sector]
  );
  return matchmaking.count > 0;
}

async function partyAHasProposalInAnySector(partyAId, sectors) {
  for (const sector of sectors) {
    if (await partyAHasProposalInSector(partyAId, sector)) {
      return true;
    }
  }
  return false;
}

async function assertCanViewPartyAProfile(viewer, targetUserId) {
  const targetId = Number(targetUserId);
  if (!targetId) {
    return { error: 'Invalid user id', status: 400 };
  }

  if (viewer.role === 'party_a') {
    if (viewer.id !== targetId) {
      return { error: 'You can only view your own profile', status: 403 };
    }
  } else if (viewer.role !== 'super_admin' && viewer.role !== 'sector_lead') {
    return { error: 'Forbidden', status: 403 };
  }

  const user = await getPartyAUser(targetId);
  if (!user) {
    return { error: 'Party A profile not found', status: 404 };
  }

  if (viewer.role === 'sector_lead') {
    const sectors = getSectorLeadScopedSectors(viewer);
    if (!sectors.length) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    const inSector = await partyAHasProposalInAnySector(targetId, sectors);
    if (!inSector) {
      return {
        error: 'This Party A has no submitted proposals in your sector',
        status: 403,
      };
    }
  }

  return {
    ok: true,
    user,
    read_only: viewer.id !== targetId,
  };
}

async function assertCanViewPartyAProfileOnProposal(viewer, targetUserId, proposal) {
  const targetId = Number(targetUserId);
  if (!targetId || Number(proposal.party_a_id) !== targetId) {
    return { error: 'Party A profile not linked to this proposal', status: 404 };
  }

  const user = await getPartyAUser(targetId);
  if (!user) {
    return { error: 'Party A profile not found', status: 404 };
  }

  if (viewer.role === 'super_admin') {
    return { ok: true, user, read_only: viewer.id !== targetId };
  }

  if (viewer.role === 'sector_lead') {
    if (!sectorLeadHasAnySector(viewer)) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    if (!sectorLeadCoversSector(viewer, proposal.sector)) {
      return { error: 'Access denied — wrong sector', status: 403 };
    }
    return { ok: true, user, read_only: true };
  }

  if (viewer.role === 'party_a' && viewer.id === targetId) {
    return { ok: true, user, read_only: false };
  }

  if (
    ['party_b', 'investor'].includes(viewer.role) &&
    Number(proposal.party_b_user_id) === viewer.id
  ) {
    return { ok: true, user, read_only: true };
  }

  return { error: 'Forbidden', status: 403 };
}

module.exports = {
  getPartyAUser,
  partyAHasProposalInSector,
  assertCanViewPartyAProfile,
  assertCanViewPartyAProfileOnProposal,
};

const pool = require('../config/db');

const PARTY_B_ROLES = new Set(['party_b', 'investor']);

async function getPartyBUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, full_name, email, role, organization, phone, country, created_at
     FROM users WHERE id = ?`,
    [userId]
  );
  const user = rows[0];
  if (!user || !PARTY_B_ROLES.has(user.role)) return null;
  return user;
}

async function partyBHasProposalInSector(partyBUserId, sector) {
  const [[legacy]] = await pool.query(
    `SELECT COUNT(*) AS count FROM proposals
     WHERE party_b_user_id = ? AND sector = ? AND status != 'draft'`,
    [partyBUserId, sector]
  );
  if (legacy.count > 0) return true;

  const [[matchmaking]] = await pool.query(
    `SELECT COUNT(*) AS count FROM mm_proposals
     WHERE submitted_by = ? AND side = 'side_b' AND sector = ? AND status != 'draft'`,
    [partyBUserId, sector]
  );
  return matchmaking.count > 0;
}

async function assertCanViewPartyBProfile(viewer, targetUserId) {
  const targetId = Number(targetUserId);
  if (!targetId) {
    return { error: 'Invalid user id', status: 400 };
  }

  if (PARTY_B_ROLES.has(viewer.role)) {
    if (viewer.id !== targetId) {
      return { error: 'You can only view your own profile', status: 403 };
    }
  } else if (viewer.role !== 'super_admin' && viewer.role !== 'sector_lead') {
    return { error: 'Forbidden', status: 403 };
  }

  const user = await getPartyBUser(targetId);
  if (!user) {
    return { error: 'Party B profile not found', status: 404 };
  }

  if (viewer.role === 'sector_lead') {
    if (!viewer.sector) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    const inSector = await partyBHasProposalInSector(targetId, viewer.sector);
    if (!inSector) {
      return {
        error: 'This Party B has no linked proposals in your sector',
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

async function assertCanViewPartyBProfileOnProposal(viewer, targetUserId, proposal) {
  const targetId = Number(targetUserId);
  if (!targetId || Number(proposal.party_b_user_id) !== targetId) {
    return {
      ok: false,
      linked: false,
      error: 'Party B not linked to this proposal',
      status: 404,
    };
  }

  const user = await getPartyBUser(targetId);
  if (!user) {
    return { error: 'Party B profile not found', status: 404 };
  }

  if (viewer.role === 'super_admin') {
    return { ok: true, user, read_only: viewer.id !== targetId };
  }

  if (viewer.role === 'sector_lead') {
    if (!viewer.sector) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    if (proposal.sector !== viewer.sector) {
      return { error: 'Access denied — wrong sector', status: 403 };
    }
    return { ok: true, user, read_only: true };
  }

  if (PARTY_B_ROLES.has(viewer.role) && viewer.id === targetId) {
    return { ok: true, user, read_only: false };
  }

  if (viewer.role === 'party_a' && Number(proposal.party_a_id) === viewer.id) {
    return { ok: true, user, read_only: true };
  }

  return { error: 'Forbidden', status: 403 };
}

module.exports = {
  PARTY_B_ROLES,
  getPartyBUser,
  partyBHasProposalInSector,
  assertCanViewPartyBProfile,
  assertCanViewPartyBProfileOnProposal,
};

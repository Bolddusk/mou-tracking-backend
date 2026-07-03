const pool = require('../config/db');

const STAFF_PROFILE_EDIT_ROLES = new Set([
  'super_admin',
  'admin',
  'sector_lead',
  'focal_point',
  'regional_focal_point',
]);

function isStaffProfileEditor(role) {
  return STAFF_PROFILE_EDIT_ROLES.has(role);
}

async function partyAHasFocalPointLink(focalUserId, partyAId) {
  const [rows] = await pool.query(
    `SELECT p.id
     FROM proposals p
     LEFT JOIN mm_matches m ON m.engagement_proposal_id = p.id
     LEFT JOIN mm_proposals sa ON sa.id = m.side_a_proposal_id
     LEFT JOIN mm_proposals sb ON sb.id = m.side_b_proposal_id
     WHERE p.party_a_id = ?
       AND p.status != 'draft'
       AND (
         sa.forwarded_to = ?
         OR sb.forwarded_to = ?
         OR m.matched_by = ?
       )
     LIMIT 1`,
    [partyAId, focalUserId, focalUserId, focalUserId]
  );
  return rows.length > 0;
}

async function partyBHasFocalPointLink(focalUserId, partyBUserId) {
  const [rows] = await pool.query(
    `SELECT p.id
     FROM proposals p
     LEFT JOIN mm_matches m ON m.engagement_proposal_id = p.id
     LEFT JOIN mm_proposals sa ON sa.id = m.side_a_proposal_id
     LEFT JOIN mm_proposals sb ON sb.id = m.side_b_proposal_id
     WHERE p.party_b_user_id = ?
       AND p.status != 'draft'
       AND (
         sa.forwarded_to = ?
         OR sb.forwarded_to = ?
         OR m.matched_by = ?
       )
     LIMIT 1`,
    [partyBUserId, focalUserId, focalUserId, focalUserId]
  );
  return rows.length > 0;
}

module.exports = {
  STAFF_PROFILE_EDIT_ROLES,
  isStaffProfileEditor,
  partyAHasFocalPointLink,
  partyBHasFocalPointLink,
};

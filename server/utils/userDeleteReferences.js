const pool = require('../config/db');

async function queryDb(sql, params, connection) {
  if (connection) {
    const [rows] = await connection.query(sql, params);
    return rows;
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function countRef(sql, params, connection) {
  const rows = await queryDb(sql, params, connection);
  return Number(rows[0]?.count || rows[0]?.c || 0);
}

async function getUserStats(userId, connection = null) {
  const proposalsFiled = await countRef(
    'SELECT COUNT(*) AS count FROM proposals WHERE party_a_id = ?',
    [userId],
    connection
  );
  const proposalsAsPartyB = await countRef(
    'SELECT COUNT(*) AS count FROM proposals WHERE party_b_user_id = ?',
    [userId],
    connection
  );
  const proposalsReviewed = await countRef(
    'SELECT COUNT(*) AS count FROM proposals WHERE reviewed_by = ?',
    [userId],
    connection
  );
  const complaintsFiled = await countRef(
    'SELECT COUNT(*) AS count FROM complaints WHERE filed_by = ?',
    [userId],
    connection
  );
  const complaintsTagged = await countRef(
    'SELECT COUNT(*) AS count FROM complaints WHERE tagged_sector_lead = ?',
    [userId],
    connection
  );
  const complaintsForwarded = await countRef(
    'SELECT COUNT(*) AS count FROM complaints WHERE forwarded_to = ?',
    [userId],
    connection
  );
  const activitiesAdded = await countRef(
    'SELECT COUNT(*) AS count FROM proposal_activities WHERE added_by = ?',
    [userId],
    connection
  );

  let complaintsPartyB = 0;
  try {
    complaintsPartyB = await countRef(
      'SELECT COUNT(*) AS count FROM complaints WHERE party_b_user_id = ?',
      [userId],
      connection
    );
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
  }

  let mmSubmitted = 0;
  try {
    mmSubmitted = await countRef(
      'SELECT COUNT(*) AS count FROM mm_proposals WHERE submitted_by = ?',
      [userId],
      connection
    );
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') throw err;
  }

  return {
    proposals_filed: proposalsFiled,
    proposals_as_party_b: proposalsAsPartyB,
    proposals_reviewed: proposalsReviewed,
    complaints_filed: complaintsFiled,
    complaints_tagged: complaintsTagged,
    complaints_forwarded: complaintsForwarded,
    complaints_party_b: complaintsPartyB,
    activities_added: activitiesAdded,
    mm_proposals_submitted: mmSubmitted,
  };
}

async function getUserReferences(userId, connection = null) {
  const stats = await getUserStats(userId, connection);
  const unlinkable =
    stats.proposals_as_party_b +
    stats.proposals_reviewed +
    stats.complaints_party_b;
  const blocking =
    stats.proposals_filed +
    stats.complaints_filed +
    stats.complaints_tagged +
    stats.complaints_forwarded +
    stats.activities_added +
    stats.mm_proposals_submitted;
  const total = unlinkable + blocking;

  return { stats, total, unlinkable, blocking };
}

async function runUpdate(sql, params, connection) {
  if (connection) {
    const [result] = await connection.query(sql, params);
    return result.affectedRows || 0;
  }
  const [result] = await pool.query(sql, params);
  return result.affectedRows || 0;
}

async function safeUpdate(label, sql, params, connection, unlinked) {
  try {
    unlinked[label] = await runUpdate(sql, params, connection);
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
      unlinked[label] = 0;
      return;
    }
    throw err;
  }
}

async function unlinkDeletableUserReferences(userId, connection = null) {
  const unlinked = {};

  unlinked.proposals_party_b = await runUpdate(
    'UPDATE proposals SET party_b_user_id = NULL WHERE party_b_user_id = ?',
    [userId],
    connection
  );

  await safeUpdate(
    'proposals_reviewed_by',
    'UPDATE proposals SET reviewed_by = NULL WHERE reviewed_by = ?',
    [userId],
    connection,
    unlinked
  );

  await safeUpdate(
    'proposals_deal_closed_by',
    'UPDATE proposals SET deal_closed_by = NULL WHERE deal_closed_by = ?',
    [userId],
    connection,
    unlinked
  );

  await safeUpdate(
    'complaints_party_b',
    'UPDATE complaints SET party_b_user_id = NULL WHERE party_b_user_id = ?',
    [userId],
    connection,
    unlinked
  );

  await safeUpdate(
    'mm_proposals_reviewed_by',
    'UPDATE mm_proposals SET reviewed_by = NULL WHERE reviewed_by = ?',
    [userId],
    connection,
    unlinked
  );

  await safeUpdate(
    'mm_proposals_forwarded_to',
    'UPDATE mm_proposals SET forwarded_to = NULL WHERE forwarded_to = ?',
    [userId],
    connection,
    unlinked
  );

  return unlinked;
}

function parseUnlinkReferencesFlag(queryValue) {
  return ['true', '1', 'yes'].includes(String(queryValue || '').toLowerCase());
}

module.exports = {
  getUserStats,
  getUserReferences,
  unlinkDeletableUserReferences,
  parseUnlinkReferencesFlag,
};

const pool = require('../config/db');
const { formatMouAckStatus } = require('./mouAcknowledgment');

function shouldResetAckOnNewFile(record) {
  return (
    record.mou_status === 'signed' ||
    Boolean(record.mou_ack_by_a) ||
    Boolean(record.mou_ack_by_b)
  );
}

async function getNextVersionNumber({ proposalId = null, matchId = null }) {
  let query = 'SELECT MAX(version_number) AS max_version FROM mou_file_versions WHERE ';
  const params = [];

  if (proposalId) {
    query += 'proposal_id = ?';
    params.push(proposalId);
  } else {
    query += 'match_id = ?';
    params.push(matchId);
  }

  const [[row]] = await pool.query(query, params);
  return (row.max_version || 0) + 1;
}

async function insertMouFileVersion({
  proposalId = null,
  matchId = null,
  fileUrl,
  uploadedBy,
  versionNumber,
  connection = pool,
}) {
  await connection.query(
    `INSERT INTO mou_file_versions (proposal_id, match_id, file_url, uploaded_by, version_number)
     VALUES (?, ?, ?, ?, ?)`,
    [proposalId, matchId, fileUrl, uploadedBy, versionNumber]
  );
}

async function listMouFileVersions({ proposalId = null, matchId = null }) {
  const filter = proposalId ? 'v.proposal_id = ?' : 'v.match_id = ?';
  const id = proposalId || matchId;

  const [rows] = await pool.query(
    `SELECT v.id, v.proposal_id, v.match_id, v.file_url, v.version_number, v.uploaded_at,
            v.uploaded_by, u.full_name AS uploaded_by_name, u.email AS uploaded_by_email
     FROM mou_file_versions v
     JOIN users u ON u.id = v.uploaded_by
     WHERE ${filter}
     ORDER BY v.version_number DESC`,
    [id]
  );

  return rows.map((row) => ({
    id: row.id,
    proposal_id: row.proposal_id,
    match_id: row.match_id,
    file_url: row.file_url,
    version_number: row.version_number,
    uploaded_at: row.uploaded_at,
    uploaded_by: row.uploaded_by,
    uploaded_by_name: row.uploaded_by_name,
    uploaded_by_email: row.uploaded_by_email,
  }));
}

function markCurrentVersion(versions, currentFileUrl) {
  if (!versions.length) return [];

  let currentMarked = false;
  const marked = versions.map((version) => {
    const isCurrent = Boolean(currentFileUrl && version.file_url === currentFileUrl);
    if (isCurrent) currentMarked = true;
    return { ...version, is_current: isCurrent };
  });

  if (!currentMarked) {
    marked[0].is_current = true;
  }

  return marked;
}

async function buildMouStatusWithVersions(record, mouFileUrl, { proposalId = null, matchId = null }) {
  const versions = await listMouFileVersions({ proposalId, matchId });
  const versionsWithCurrent = markCurrentVersion(versions, mouFileUrl);
  const currentEntry = versionsWithCurrent.find((v) => v.is_current) || null;

  return {
    ...formatMouAckStatus(record, mouFileUrl),
    current_version: currentEntry?.version_number ?? null,
    total_versions: versionsWithCurrent.length,
    versions: versionsWithCurrent,
  };
}

module.exports = {
  shouldResetAckOnNewFile,
  getNextVersionNumber,
  insertMouFileVersion,
  listMouFileVersions,
  buildMouStatusWithVersions,
};

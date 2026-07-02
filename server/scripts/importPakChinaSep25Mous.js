/**
 * Import Pak China Sep-25 Conference MOUs from consolidated JSON.
 *
 * Run:
 *   npm run db:import:pak-china-sep25-mous
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { PAK_CHINA_SEP_25_CONFERENCE } = require('../constants/conferences');
const {
  loadPakChinaSep25MouRows,
  buildProposalRecord,
} = require('../utils/pakChinaSep25MouDataImport');

const PARTY_A_EMAIL = process.env.IMPORT_PARTY_A_EMAIL || 'superadmin@test.com';
const SECTOR_LEAD_EMAIL = process.env.IMPORT_SECTOR_LEAD_EMAIL || 'sectorlead@test.com';
const REPLACE_EXISTING = process.argv.includes('--replace');

async function requireUser(email, label) {
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE email = ?', [email]);
  if (!rows.length) {
    throw new Error(`${label} not found (${email}). Run: npm run db:seed`);
  }
  return rows[0];
}

async function findExistingReference(connection, externalReference) {
  const [rows] = await connection.query(
    'SELECT id, external_reference FROM proposals WHERE external_reference = ? LIMIT 1',
    [externalReference]
  );
  return rows[0] || null;
}

async function findSep25ProposalIds(connection) {
  const [rows] = await connection.query(
    `SELECT id FROM proposals
     WHERE conference_key = ?
        OR external_reference LIKE 'PAK-CHINA-SEP25-MOU-%'`,
    [PAK_CHINA_SEP_25_CONFERENCE.key]
  );
  return rows.map((row) => row.id);
}

async function deleteProposalsByIds(connection, proposalIds) {
  if (!proposalIds.length) return;

  const [complaints] = await connection.query(
    'SELECT id FROM complaints WHERE proposal_id IN (?)',
    [proposalIds]
  );
  const complaintIds = complaints.map((row) => row.id);

  if (complaintIds.length) {
    await connection.query('DELETE FROM complaint_comments WHERE complaint_id IN (?)', [complaintIds]);
    await connection.query('DELETE FROM complaint_actions WHERE complaint_id IN (?)', [complaintIds]);
    await connection.query('DELETE FROM complaints WHERE id IN (?)', [complaintIds]);
  }

  await connection.query('DELETE FROM proposal_chat_messages WHERE proposal_id IN (?)', [proposalIds]);
  await connection.query('DELETE FROM proposal_activities WHERE proposal_id IN (?)', [proposalIds]);
  await connection.query('DELETE FROM mou_file_versions WHERE proposal_id IN (?)', [proposalIds]);
  await connection.query('DELETE FROM proposals WHERE id IN (?)', [proposalIds]);
}

async function insertProposal(connection, row) {
  const cols = Object.keys(row);
  const [result] = await connection.query(
    `INSERT INTO proposals (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(row)
  );
  return result.insertId;
}

async function main() {
  console.log('\n=== Import Pak China Sep-25 Conference MOUs ===');
  console.log(`Conference: ${PAK_CHINA_SEP_25_CONFERENCE.name}`);

  const partyA = await requireUser(PARTY_A_EMAIL, 'Import Party A owner');
  const sectorLead = await requireUser(SECTOR_LEAD_EMAIL, 'Sector Lead reviewer');
  const rows = loadPakChinaSep25MouRows();

  const activeCount = rows.filter((row) => row.operational_status === 'Active').length;
  const executionCount = rows.filter((row) => row.in_execution).length;
  const inactiveCount = rows.filter((row) => row.collaboration_dropped).length;

  console.log(`Loaded ${rows.length} MOU rows`);
  console.log(`Active: ${activeCount}, In Execution: ${executionCount}, Inactive: ${inactiveCount}\n`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (REPLACE_EXISTING) {
      const existingIds = await findSep25ProposalIds(connection);
      console.log(`--replace: removing ${existingIds.length} existing Sep-25 MOU(s)...`);
      await deleteProposalsByIds(connection, existingIds);
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      const existing = await findExistingReference(connection, row.external_reference);
      if (existing && !REPLACE_EXISTING) {
        console.log(`Skip (exists): Seq ${row.seq} → proposal #${existing.id}`);
        skipped += 1;
        continue;
      }

      const proposal = buildProposalRecord(row, partyA.id, sectorLead.id);
      const proposalId = await insertProposal(connection, proposal);
      const tag = row.in_execution
        ? ' [EXECUTION]'
        : row.collaboration_dropped
          ? ' [INACTIVE]'
          : ' [ACTIVE]';
      console.log(
        `Imported Seq ${String(row.seq).padStart(3, '0')} (Sr ${row.sr_no}) → proposal #${proposalId}${tag} ${row.venture_name}`
      );
      inserted += 1;
    }

    await connection.commit();

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS cnt FROM proposals WHERE conference_key = ?`,
      [PAK_CHINA_SEP_25_CONFERENCE.key]
    );

    console.log('\n--- Summary ---');
    console.log(`Inserted: ${inserted}`);
    console.log(`Skipped:  ${skipped}`);
    console.log(`Sep-25 in DB now: ${countRow.cnt} (expected ${rows.length})`);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});

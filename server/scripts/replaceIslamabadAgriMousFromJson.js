/**
 * Replace all Islamabad conference MOUs (68 legacy imports) with 99 rows from mou_data.json.
 *
 * Run:
 *   npm run db:replace:islamabad-agri-mous
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { ISLAMABAD_AGRI_2026 } = require('../constants/conferences');
const {
  loadIslamabadMouDataRows,
  buildProposalRecord,
} = require('../utils/islamabadAgriMouDataImport');

const PARTY_A_EMAIL = process.env.IMPORT_PARTY_A_EMAIL || 'superadmin@test.com';
const { DEFAULT_SECTOR_LEAD_EMAIL } = require('../constants/seedDefaults');
const SECTOR_LEAD_EMAIL = process.env.IMPORT_SECTOR_LEAD_EMAIL || DEFAULT_SECTOR_LEAD_EMAIL;

async function requireUser(email, label) {
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE email = ?', [email]);
  if (!rows.length) {
    throw new Error(`${label} not found (${email}). Run: npm run db:seed`);
  }
  return rows[0];
}

async function findIslamabadProposalIds(connection) {
  const [rows] = await connection.query(
    `SELECT id FROM proposals
     WHERE conference_key = ?
        OR external_reference LIKE 'ISLAMABAD-AGRI-%'`,
    [ISLAMABAD_AGRI_2026.key]
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
  console.log('\n=== Replace Islamabad Agri MOUs from mou_data.json ===');
  console.log(`Conference: ${ISLAMABAD_AGRI_2026.name}`);

  const partyA = await requireUser(PARTY_A_EMAIL, 'Import Party A owner');
  const sectorLead = await requireUser(SECTOR_LEAD_EMAIL, 'Sector Lead reviewer');
  const rows = loadIslamabadMouDataRows();

  console.log(`Loaded ${rows.length} MOU rows from mou_data.json`);
  const activeCount = rows.filter((row) => !row.collaboration_dropped).length;
  const inactiveCount = rows.length - activeCount;
  console.log(`Active: ${activeCount}, Inactive: ${inactiveCount}\n`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const existingIds = await findIslamabadProposalIds(connection);
    console.log(`Removing ${existingIds.length} existing Islamabad MOU proposal(s)...`);
    await deleteProposalsByIds(connection, existingIds);

    let inserted = 0;
    for (const row of rows) {
      const proposal = buildProposalRecord(row, partyA.id, sectorLead.id);
      const proposalId = await insertProposal(connection, proposal);
      const tag = row.collaboration_dropped ? ' [INACTIVE]' : ' [ACTIVE]';
      console.log(
        `Imported Seq ${String(row.seq).padStart(3, '0')} (Sr ${row.sr_no}) → proposal #${proposalId}${tag} ${row.venture_name}`
      );
      inserted += 1;
    }

    await connection.commit();

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) AS cnt FROM proposals WHERE conference_key = ?`,
      [ISLAMABAD_AGRI_2026.key]
    );

    console.log('\n--- Summary ---');
    console.log(`Deleted:  ${existingIds.length}`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Islamabad in DB now: ${countRow.cnt} (expected ${rows.length})`);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Replace failed:', err.message);
  process.exit(1);
});

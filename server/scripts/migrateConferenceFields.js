require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');
const { HANGZHOU_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await columnExists(connection, 'proposals', 'conference_key'))) {
    await connection.query('ALTER TABLE proposals ADD COLUMN conference_key VARCHAR(80) NULL');
    console.log('Added proposals.conference_key');
  }

  if (!(await columnExists(connection, 'proposals', 'conference_name'))) {
    await connection.query('ALTER TABLE proposals ADD COLUMN conference_name VARCHAR(500) NULL');
    console.log('Added proposals.conference_name');
  }

  const conferenceInfo = JSON.stringify(buildConferenceInfo(HANGZHOU_AGRI_2026));

  const [result] = await connection.query(
    `UPDATE proposals
     SET
       conference_key = ?,
       conference_name = ?,
       conference_info = ?
     WHERE external_reference LIKE 'HANGZHOU-AGRI-%'
        OR conference_key = ?
        OR conference_key IS NULL AND external_reference LIKE 'HANGZHOU-AGRI-%'`,
    [HANGZHOU_AGRI_2026.key, HANGZHOU_AGRI_2026.name, conferenceInfo, HANGZHOU_AGRI_2026.key]
  );
  console.log(`Backfilled conference fields on ${result.affectedRows} imported proposal(s)`);

  await connection.end();
  console.log('Conference fields migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

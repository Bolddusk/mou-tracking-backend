require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const LEGACY_STATUS_ENUM = "'draft','submitted','approved','rejected'";

const MATCHMAKING_COLUMNS = [
  'forwarded_to_rfp',
  'forwarded_at',
  'shortlisted_at',
  'shortlisted_by',
  'uploaded_by_rfp',
  'origin',
];

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function rollback() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  console.log('Rolling back proposal matchmaking migration...');

  if (await tableExists(connection, 'proposal_matches')) {
    await connection.query('DROP TABLE proposal_matches');
    console.log('Dropped proposal_matches');
  }

  if (await columnExists(connection, 'proposals', 'origin')) {
    await connection.query(`DELETE FROM proposals WHERE origin = 'china'`);
    console.log('Removed China-side proposals');
  }

  await connection.query(`
    UPDATE proposals SET status = 'submitted'
    WHERE status IN ('shortlisted', 'forwarded_to_china', 'match_pending_review')
  `);
  await connection.query(`
    UPDATE proposals SET status = 'approved'
    WHERE status = 'matched'
  `);
  console.log('Mapped matchmaking statuses back to submitted/approved');

  for (const col of MATCHMAKING_COLUMNS) {
    if (await columnExists(connection, 'proposals', col)) {
      await connection.query(`ALTER TABLE proposals DROP COLUMN ${col}`);
      console.log(`Dropped proposals.${col}`);
    }
  }

  await connection.query(
    `ALTER TABLE proposals MODIFY status ENUM(${LEGACY_STATUS_ENUM}) NOT NULL DEFAULT 'draft'`
  );
  console.log('Restored proposals.status enum to draft/submitted/approved/rejected');

  await connection.end();
  console.log('Matchmaking rollback complete.');
}

rollback().catch((err) => {
  console.error('Rollback failed:', err.message);
  process.exit(1);
});

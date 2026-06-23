require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

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

  await connection.query(`
    ALTER TABLE proposals
    MODIFY COLUMN status ENUM(
      'draft','submitted','approved','rejected','resubmitted','completed'
    ) NOT NULL DEFAULT 'draft'
  `);
  console.log('Updated proposals.status enum (ensured resubmitted)');

  if (!(await columnExists(connection, 'proposals', 'resubmit_count'))) {
    await connection.query(`
      ALTER TABLE proposals
      ADD COLUMN resubmit_count INT NOT NULL DEFAULT 0,
      ADD COLUMN last_resubmitted_at TIMESTAMP NULL
    `);
    console.log('Added proposals.resubmit_count / last_resubmitted_at');
  }

  await connection.end();
  console.log('Proposal resubmit migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

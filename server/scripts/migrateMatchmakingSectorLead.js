require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  console.log('Matchmaking sector lead review migration...');

  await connection.query(`
    ALTER TABLE mm_pakistan_proposals
    MODIFY status ENUM('draft','submitted','shortlisted','rejected')
      NOT NULL DEFAULT 'draft'
  `);
  console.log('Extended status enum: draft, submitted, shortlisted, rejected');

  const columns = [
    ['sector_lead_comment', 'TEXT NULL'],
    ['reviewed_by', 'INT NULL'],
    ['reviewed_at', 'TIMESTAMP NULL'],
    ['shortlisted_at', 'TIMESTAMP NULL'],
    ['shortlisted_by', 'INT NULL'],
  ];

  for (const [name, definition] of columns) {
    if (!(await columnExists(connection, 'mm_pakistan_proposals', name))) {
      await connection.query(`ALTER TABLE mm_pakistan_proposals ADD COLUMN ${name} ${definition}`);
      console.log(`Added mm_pakistan_proposals.${name}`);
    }
  }

  await connection.end();
  console.log('Matchmaking sector lead migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

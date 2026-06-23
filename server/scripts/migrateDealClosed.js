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
  console.log('Updated proposals.status enum (added completed)');

  await connection.query(`
    ALTER TABLE proposals
    MODIFY COLUMN mou_status ENUM(
      'not_started','in_progress','uploaded','signed','deal_closed'
    ) DEFAULT 'not_started'
  `);
  console.log('Updated proposals.mou_status enum (added deal_closed)');

  if (!(await columnExists(connection, 'proposals', 'deal_closed_at'))) {
    await connection.query(`
      ALTER TABLE proposals
      ADD COLUMN deal_closed_at TIMESTAMP NULL,
      ADD COLUMN deal_closed_by INT NULL,
      ADD CONSTRAINT fk_proposals_deal_closed_by
        FOREIGN KEY (deal_closed_by) REFERENCES users(id)
    `);
    console.log('Added proposals.deal_closed_at / deal_closed_by');
  }

  await connection.query(`
    ALTER TABLE mm_matches
    MODIFY COLUMN mou_status ENUM(
      'not_started','in_progress','uploaded','signed','deal_closed'
    ) DEFAULT 'not_started'
  `);
  console.log('Updated mm_matches.mou_status enum (added deal_closed)');

  if (!(await columnExists(connection, 'mm_matches', 'deal_closed_at'))) {
    await connection.query(`
      ALTER TABLE mm_matches
      ADD COLUMN deal_closed_at TIMESTAMP NULL,
      ADD COLUMN deal_closed_by INT NULL
    `);
    console.log('Added mm_matches.deal_closed_at / deal_closed_by');
  }

  await connection.end();
  console.log('Deal closed migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

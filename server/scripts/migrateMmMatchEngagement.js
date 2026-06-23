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

  if (!(await columnExists(connection, 'mm_matches', 'engagement_proposal_id'))) {
    await connection.query(`
      ALTER TABLE mm_matches
      ADD COLUMN engagement_proposal_id INT NULL,
      ADD CONSTRAINT fk_mm_matches_engagement
        FOREIGN KEY (engagement_proposal_id) REFERENCES proposals(id)
    `);
    console.log('Added mm_matches.engagement_proposal_id');
  }

  if (!(await columnExists(connection, 'mm_matches', 'mou_status'))) {
    await connection.query(`
      ALTER TABLE mm_matches
      ADD COLUMN mou_status ENUM('not_started','in_progress','uploaded','signed','deal_closed')
        NOT NULL DEFAULT 'not_started'
    `);
    console.log('Added mm_matches.mou_status');
  } else {
    await connection.query(`
      ALTER TABLE mm_matches
      MODIFY COLUMN mou_status ENUM('not_started','in_progress','uploaded','signed','deal_closed')
        NOT NULL DEFAULT 'not_started'
    `);
    console.log('Updated mm_matches.mou_status ENUM (added deal_closed)');
  }

  const mouColumns = [
    ['mou_uploaded_at', 'TIMESTAMP NULL'],
    ['mou_uploaded_by', 'INT NULL'],
    ['mou_ack_by_a', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['mou_ack_by_a_at', 'TIMESTAMP NULL'],
    ['mou_ack_by_b', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['mou_ack_by_b_at', 'TIMESTAMP NULL'],
    ['deal_closed_at', 'TIMESTAMP NULL'],
    ['deal_closed_by', 'INT NULL'],
  ];

  for (const [col, def] of mouColumns) {
    if (!(await columnExists(connection, 'mm_matches', col))) {
      await connection.query(`ALTER TABLE mm_matches ADD COLUMN ${col} ${def}`);
      console.log(`Added mm_matches.${col}`);
    }
  }

  await connection.end();
  console.log('mm_matches engagement/MOU extension migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

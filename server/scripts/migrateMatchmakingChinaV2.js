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

  console.log('Matchmaking China V2 migration...');

  if (!(await columnExists(connection, 'mm_china_proposals', 'submitted_by_investor'))) {
    await connection.query(`
      ALTER TABLE mm_china_proposals
      ADD COLUMN submitted_by_investor INT NULL AFTER uploaded_by_rfp,
      ADD CONSTRAINT fk_mm_cn_investor
        FOREIGN KEY (submitted_by_investor) REFERENCES users(id)
    `);
    console.log('Added submitted_by_investor');
  }

  await connection.query(`
    ALTER TABLE mm_china_proposals
    MODIFY uploaded_by_rfp INT NULL
  `);
  console.log('uploaded_by_rfp nullable (legacy RFP uploads)');

  const columns = [
    ['submitted_at', 'TIMESTAMP NULL'],
    ['shortlisted_at', 'TIMESTAMP NULL'],
    ['shortlisted_by', 'INT NULL'],
    ['fop_comment', 'TEXT NULL'],
    ['reviewed_by', 'INT NULL'],
    ['reviewed_at', 'TIMESTAMP NULL'],
    ['forwarded_to_sl', 'INT NULL'],
    ['forwarded_at', 'TIMESTAMP NULL'],
  ];

  for (const [name, definition] of columns) {
    if (!(await columnExists(connection, 'mm_china_proposals', name))) {
      await connection.query(`ALTER TABLE mm_china_proposals ADD COLUMN ${name} ${definition}`);
      console.log(`Added mm_china_proposals.${name}`);
    }
  }

  await connection.query(`
    ALTER TABLE mm_china_proposals
    MODIFY status ENUM(
      'draft','submitted','shortlisted','rejected',
      'forwarded_to_pakistan','matched','active','archived'
    ) NOT NULL DEFAULT 'draft'
  `);
  console.log('Extended mm_china_proposals status enum (V2)');

  await connection.end();
  console.log('Matchmaking China V2 migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

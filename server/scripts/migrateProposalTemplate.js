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

const NEW_COLUMNS = [
  ['company_name', 'VARCHAR(255) NULL'],
  ['company_logo_url', 'VARCHAR(500) NULL'],
  ['cover_image_url', 'VARCHAR(500) NULL'],
  ['project_type', "ENUM('Greenfield','Brownfield') NULL"],
  ['venture_name', 'VARCHAR(255) NULL'],
  ['executive_summary', 'JSON NULL'],
  ['company_overview', 'JSON NULL'],
  ['project_overview', 'JSON NULL'],
  ['financials', 'JSON NULL'],
  ['investment_ask', 'JSON NULL'],
  ['contact_info', 'JSON NULL'],
];

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  for (const [column, definition] of NEW_COLUMNS) {
    if (!(await columnExists(connection, 'proposals', column))) {
      await connection.query(`ALTER TABLE proposals ADD COLUMN ${column} ${definition}`);
      console.log(`Added proposals.${column}`);
    }
  }

  await connection.query(
    `UPDATE proposals
     SET venture_name = COALESCE(NULLIF(venture_name, ''), NULLIF(proposal_title, '')),
         company_name = COALESCE(NULLIF(company_name, ''), NULLIF(proposal_title, ''))
     WHERE proposal_title IS NOT NULL AND proposal_title != ''`
  );
  console.log('Backfilled venture_name / company_name from legacy proposal_title where empty');

  await connection.end();
  console.log('Proposal template migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

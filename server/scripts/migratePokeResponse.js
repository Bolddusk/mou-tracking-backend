require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const COLUMNS = [
  ['response_date', 'DATE NULL'],
  ['response_title', 'VARCHAR(255) NULL'],
  ['response_description', 'TEXT NULL'],
  ['response_support_file_url', 'VARCHAR(500) NULL'],
  ['response_submitted_at', 'TIMESTAMP NULL'],
  ['response_by', 'INT NULL'],
];

async function columnExists(connection, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'proposal_activities'
       AND COLUMN_NAME = ?`,
    [column]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  for (const [col, def] of COLUMNS) {
    if (!(await columnExists(connection, col))) {
      await connection.query(
        `ALTER TABLE proposal_activities ADD COLUMN ${col} ${def}`
      );
      console.log(`Added proposal_activities.${col}`);
    }
  }

  await connection.end();
  console.log('Poke linked-response migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

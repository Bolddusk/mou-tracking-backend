require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const COLUMNS = [
  ['poke_dismissed_at', 'TIMESTAMP NULL'],
  ['poke_dismissed_by', 'INT NULL'],
  ['response_promoted_at', 'TIMESTAMP NULL'],
  ['response_promoted_by', 'INT NULL'],
  ['promoted_progress_activity_id', 'INT NULL'],
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
      await connection.query(`ALTER TABLE proposal_activities ADD COLUMN ${col} ${def}`);
      console.log(`Added proposal_activities.${col}`);
    }
  }

  await connection.end();
  console.log('Poke workflow migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

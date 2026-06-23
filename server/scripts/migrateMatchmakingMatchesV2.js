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

  console.log('Matchmaking matches V2 migration...');

  if (!(await columnExists(connection, 'mm_matches', 'created_by_sl'))) {
    await connection.query(`
      ALTER TABLE mm_matches
      ADD COLUMN created_by_sl INT NULL AFTER proposed_by_rfp,
      ADD CONSTRAINT fk_mm_match_created_sl
        FOREIGN KEY (created_by_sl) REFERENCES users(id)
    `);
    console.log('Added created_by_sl');
  }

  await connection.query(`
    ALTER TABLE mm_matches
    MODIFY proposed_by_rfp INT NULL
  `);
  console.log('proposed_by_rfp nullable (V2 matches use created_by_sl)');

  await connection.end();
  console.log('Matchmaking matches V2 migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

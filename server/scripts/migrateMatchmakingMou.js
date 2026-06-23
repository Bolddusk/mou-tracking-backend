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

  if (!(await columnExists(connection, 'mm_matches', 'mou_status'))) {
    await connection.query(`
      ALTER TABLE mm_matches
      ADD COLUMN mou_status ENUM('not_started','in_progress','uploaded','signed')
        NOT NULL DEFAULT 'not_started'
    `);
    console.log('Added mm_matches.mou_status');
  }

  for (const [col, def] of [
    ['mou_uploaded_at', 'TIMESTAMP NULL'],
    ['mou_uploaded_by', 'INT NULL'],
  ]) {
    if (!(await columnExists(connection, 'mm_matches', col))) {
      await connection.query(`ALTER TABLE mm_matches ADD COLUMN ${col} ${def}`);
      console.log(`Added mm_matches.${col}`);
    }
  }

  await connection.query(`
    UPDATE mm_matches SET mou_status = 'not_started' WHERE mou_status IS NULL
  `);

  await connection.end();
  console.log('Matchmaking MOU migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

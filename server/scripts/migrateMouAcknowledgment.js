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

async function addAckColumns(connection, table) {
  const cols = [
    ['mou_ack_by_a', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['mou_ack_by_a_at', 'TIMESTAMP NULL'],
    ['mou_ack_by_b', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['mou_ack_by_b_at', 'TIMESTAMP NULL'],
  ];

  for (const [name, def] of cols) {
    if (!(await columnExists(connection, table, name))) {
      await connection.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
      console.log(`Added ${table}.${name}`);
    }
  }
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  await addAckColumns(connection, 'proposals');
  await addAckColumns(connection, 'mm_matches');

  await connection.end();
  console.log('MOU acknowledgment migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

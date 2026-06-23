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

  if (!(await columnExists(connection, 'users', 'sector'))) {
    await connection.query('ALTER TABLE users ADD COLUMN sector VARCHAR(100) NULL');
    console.log('Added users.sector');
  }

  await connection.query(
    `ALTER TABLE proposals MODIFY status
     ENUM('draft','submitted','approved','rejected') NOT NULL DEFAULT 'draft'`
  );
  console.log('Updated proposals.status enum');

  const proposalCols = [
    ['sector_lead_comment', 'TEXT NULL'],
    ['reviewed_by', 'INT NULL'],
    ['submitted_at', 'TIMESTAMP NULL'],
    ['reviewed_at', 'TIMESTAMP NULL'],
  ];

  for (const [col, def] of proposalCols) {
    if (!(await columnExists(connection, 'proposals', col))) {
      await connection.query(`ALTER TABLE proposals ADD COLUMN ${col} ${def}`);
      console.log(`Added proposals.${col}`);
    }
  }

  await connection.end();
  console.log('Review migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

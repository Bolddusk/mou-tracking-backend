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

  if (!(await columnExists(connection, 'proposals', 'deleted_at'))) {
    await connection.query(`
      ALTER TABLE proposals
      ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL,
      ADD COLUMN deleted_by INT NULL,
      ADD COLUMN delete_reason TEXT NULL,
      ADD CONSTRAINT fk_proposals_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users(id)
    `);
    console.log('Added proposals.deleted_at / deleted_by / delete_reason');
  }

  await connection.end();
  console.log('Proposal soft-delete migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

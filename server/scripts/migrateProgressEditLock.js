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

  if (!(await columnExists(connection, 'proposal_activities', 'edit_locked'))) {
    await connection.query(
      'ALTER TABLE proposal_activities ADD COLUMN edit_locked TINYINT(1) NOT NULL DEFAULT 0'
    );
    console.log('Added proposal_activities.edit_locked');
  }

  if (!(await columnExists(connection, 'proposal_activities', 'edit_unlock_requested_at'))) {
    await connection.query(
      'ALTER TABLE proposal_activities ADD COLUMN edit_unlock_requested_at TIMESTAMP NULL'
    );
    console.log('Added proposal_activities.edit_unlock_requested_at');
  }

  if (!(await columnExists(connection, 'proposal_activities', 'edit_unlock_requested_by'))) {
    await connection.query(
      'ALTER TABLE proposal_activities ADD COLUMN edit_unlock_requested_by INT NULL'
    );
    console.log('Added proposal_activities.edit_unlock_requested_by');
  }

  if (!(await columnExists(connection, 'proposal_activities', 'edit_unlock_request_note'))) {
    await connection.query(
      'ALTER TABLE proposal_activities ADD COLUMN edit_unlock_request_note TEXT NULL'
    );
    console.log('Added proposal_activities.edit_unlock_request_note');
  }

  await connection.end();
  console.log('Progress edit-lock migration complete.');
}

migrate().catch((err) => {
  console.error('Progress edit-lock migration failed:', err.message);
  process.exit(1);
});

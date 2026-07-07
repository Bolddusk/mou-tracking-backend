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

  await connection.query(
    `ALTER TABLE proposal_activities
     MODIFY COLUMN status ENUM('pending','approved','rejected','recorded') NOT NULL DEFAULT 'recorded'`
  );
  console.log('Updated proposal_activities.status enum (added recorded, default recorded)');

  if (!(await columnExists(connection, 'proposal_activities', 'source'))) {
    await connection.query(
      `ALTER TABLE proposal_activities
       ADD COLUMN source ENUM('manual','mou_field_sync') NOT NULL DEFAULT 'manual'`
    );
    console.log('Added proposal_activities.source');
  }

  if (!(await columnExists(connection, 'proposal_activities', 'synced_fields'))) {
    await connection.query('ALTER TABLE proposal_activities ADD COLUMN synced_fields JSON NULL');
    console.log('Added proposal_activities.synced_fields');
  }

  const [pendingResult] = await connection.query(
    `UPDATE proposal_activities
     SET status = 'recorded'
     WHERE status = 'pending' AND title != 'Update Requested'`
  );
  console.log(`Converted ${pendingResult.affectedRows} pending progress row(s) to recorded`);

  await connection.end();
  console.log('Progress no-approval migration complete.');
}

migrate().catch((err) => {
  console.error('Progress migration failed:', err.message);
  process.exit(1);
});

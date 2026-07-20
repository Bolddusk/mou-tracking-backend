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
    `ALTER TABLE complaints
     MODIFY COLUMN status ENUM(
       'open','under_review','resolved','rejected','forwarded','returned_to_sector_lead','escalated'
     ) DEFAULT 'open'`
  );
  console.log('Updated complaints.status enum (+ escalated)');

  const columns = [
    ['priority', "ENUM('low','normal','high') NOT NULL DEFAULT 'normal'"],
    ['category', 'VARCHAR(100) NULL'],
    ['due_at', 'TIMESTAMP NULL'],
    ['under_review_at', 'TIMESTAMP NULL'],
    ['escalated_at', 'TIMESTAMP NULL'],
    ['escalated_by', 'INT NULL'],
    ['reopened_at', 'TIMESTAMP NULL'],
    ['awaiting_sector_lead', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['resolution_comment', 'TEXT NULL'],
  ];

  for (const [name, def] of columns) {
    if (!(await columnExists(connection, 'complaints', name))) {
      await connection.query(`ALTER TABLE complaints ADD COLUMN ${name} ${def}`);
      console.log(`Added complaints.${name}`);
    }
  }

  await connection.query(
    `ALTER TABLE complaint_actions
     MODIFY COLUMN action ENUM(
       'approved','rejected','forwarded','returned','escalated','reopened','under_review'
     ) NOT NULL`
  );
  console.log('Updated complaint_actions.action enum');

  // Backfill due_at for open complaints without due date (7 days from created)
  await connection.query(
    `UPDATE complaints
     SET due_at = DATE_ADD(created_at, INTERVAL 7 DAY)
     WHERE due_at IS NULL AND status IN ('open','under_review','escalated')`
  );

  await connection.end();
  console.log('Complaint professional migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

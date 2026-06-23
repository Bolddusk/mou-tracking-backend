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
       'open','under_review','resolved','rejected','forwarded','returned_to_sector_lead'
     ) DEFAULT 'open'`
  );
  console.log('Updated complaints.status enum');

  if (!(await columnExists(connection, 'complaints', 'returned_at'))) {
    await connection.query('ALTER TABLE complaints ADD COLUMN returned_at TIMESTAMP NULL');
    console.log('Added complaints.returned_at');
  }

  if (!(await columnExists(connection, 'complaints', 'returned_by'))) {
    await connection.query('ALTER TABLE complaints ADD COLUMN returned_by INT NULL');
    console.log('Added complaints.returned_by');
  }

  if (!(await columnExists(connection, 'complaint_comments', 'visibility'))) {
    await connection.query(
      `ALTER TABLE complaint_comments
       ADD COLUMN visibility ENUM('public','internal') NOT NULL DEFAULT 'public'`
    );
    console.log('Added complaint_comments.visibility');
  }

  if (!(await columnExists(connection, 'complaint_comments', 'document_url'))) {
    await connection.query(
      'ALTER TABLE complaint_comments ADD COLUMN document_url VARCHAR(500) NULL'
    );
    console.log('Added complaint_comments.document_url');
  }

  await connection.query(
    `ALTER TABLE complaint_actions
     MODIFY COLUMN action ENUM('approved','rejected','forwarded','returned') NOT NULL`
  );
  console.log('Updated complaint_actions.action enum');

  await connection.end();
  console.log('Complaint workflow migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

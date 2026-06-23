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

  if (!(await columnExists(connection, 'proposals', 'mou_status'))) {
    await connection.query(`
      ALTER TABLE proposals
      ADD COLUMN mou_status ENUM('not_started','in_progress','uploaded','signed')
        NOT NULL DEFAULT 'not_started'
    `);
    console.log('Added proposals.mou_status');
  }

  if (!(await columnExists(connection, 'proposals', 'mou_uploaded_at'))) {
    await connection.query('ALTER TABLE proposals ADD COLUMN mou_uploaded_at TIMESTAMP NULL');
    console.log('Added proposals.mou_uploaded_at');
  }

  if (!(await columnExists(connection, 'proposals', 'mou_uploaded_by'))) {
    await connection.query('ALTER TABLE proposals ADD COLUMN mou_uploaded_by INT NULL');
    console.log('Added proposals.mou_uploaded_by');
  }

  await connection.query(`
    UPDATE proposals
    SET mou_status = CASE
      WHEN mou_file_url IS NOT NULL AND mou_file_url != '' THEN 'uploaded'
      WHEN mou_scope IS NOT NULL AND mou_scope != '' THEN 'in_progress'
      ELSE 'not_started'
    END
    WHERE mou_status = 'not_started'
  `);
  console.log('Backfilled proposals.mou_status from existing MOU fields');

  await connection.end();
  console.log('Proposal MOU migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

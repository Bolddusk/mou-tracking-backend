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

  if (!(await columnExists(connection, 'conferences', 'engagement_type'))) {
    await connection.query(
      `ALTER TABLE conferences
       ADD COLUMN engagement_type ENUM('G2G','B2B','B2G','G2B') NULL AFTER report_title`
    );
    console.log('Added conferences.engagement_type');
  }

  if (!(await columnExists(connection, 'conferences', 'description'))) {
    await connection.query(
      `ALTER TABLE conferences ADD COLUMN description TEXT NULL AFTER engagement_type`
    );
    console.log('Added conferences.description');
  }

  const [result] = await connection.query(
    `UPDATE conferences
     SET engagement_type = COALESCE(engagement_type, 'B2B'),
         description = COALESCE(
           description,
           CONCAT('Historic signed records imported for ', name, '.')
         )
     WHERE engagement_type IS NULL OR description IS NULL`
  );
  console.log(`Backfilled ${result.affectedRows} conference row(s)`);

  await connection.end();
  console.log('Conference engagement_type + description migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

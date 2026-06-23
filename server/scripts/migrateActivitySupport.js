require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  const [cols] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'proposal_activities'
       AND COLUMN_NAME = 'support_file_url'`
  );

  if (cols[0].cnt === 0) {
    await connection.query(
      'ALTER TABLE proposal_activities ADD COLUMN support_file_url VARCHAR(500) NULL'
    );
    console.log('Added proposal_activities.support_file_url');
  } else {
    console.log('support_file_url already exists');
  }

  await connection.end();
  console.log('Activity support file migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

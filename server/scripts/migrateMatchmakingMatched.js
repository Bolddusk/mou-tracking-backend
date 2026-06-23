require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  await connection.query(`
    ALTER TABLE mm_pakistan_proposals
    MODIFY status ENUM('draft','submitted','shortlisted','rejected','forwarded_to_china','matched')
      NOT NULL DEFAULT 'draft'
  `);
  console.log('Added mm_pakistan_proposals status: matched');

  await connection.end();
  console.log('Matchmaking matched status migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

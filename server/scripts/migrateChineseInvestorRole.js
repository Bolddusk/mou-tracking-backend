require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  await connection.query(`
    ALTER TABLE users
    MODIFY role ENUM(
      'super_admin','admin','sector_lead','regional_focal_point',
      'party_a','party_b','chinese_investor'
    ) NOT NULL
  `);
  console.log('Added users.role: chinese_investor');

  await connection.end();
  console.log('Chinese investor role migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

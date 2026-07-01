require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');
const { SECTORS } = require('../constants/sectors');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await tableExists(connection, 'sectors'))) {
    await connection.query(`
      CREATE TABLE sectors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Created sectors table');
  }

  let inserted = 0;
  for (let index = 0; index < SECTORS.length; index += 1) {
    const name = SECTORS[index];
    const [existing] = await connection.query('SELECT id FROM sectors WHERE name = ?', [name]);
    if (existing.length) continue;

    await connection.query('INSERT INTO sectors (name, sort_order, is_active) VALUES (?, ?, 1)', [
      name,
      index + 1,
    ]);
    inserted += 1;
  }

  console.log(`Seeded ${inserted} sector(s) from constants (${SECTORS.length} total defined)`);
  await connection.end();
  console.log('Sectors migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

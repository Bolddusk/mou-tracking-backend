/**
 * Many-to-many sector ↔ sector_lead assignments.
 * Run: npm run db:migrate:sector-lead-assignments
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(rows[0].cnt) > 0;
}

async function main() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await tableExists(connection, 'sector_lead_assignments'))) {
    await connection.query(`
      CREATE TABLE sector_lead_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        sector VARCHAR(255) NOT NULL,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        assigned_by INT NULL,
        UNIQUE KEY uq_sl_sector (user_id, sector),
        KEY idx_sector (sector),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('Created sector_lead_assignments');
  }

  const [result] = await connection.query(
    `INSERT IGNORE INTO sector_lead_assignments (user_id, sector, is_primary)
     SELECT id, sector, 1 FROM users
     WHERE role = 'sector_lead' AND sector IS NOT NULL AND TRIM(sector) != ''`
  );
  console.log(`Backfilled ${result.affectedRows} assignment(s) from users.sector`);

  await connection.end();
  console.log('Sector lead assignments migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

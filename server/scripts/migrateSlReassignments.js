require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

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

  if (!(await tableExists(connection, 'sl_reassignments'))) {
    await connection.query(`
      CREATE TABLE sl_reassignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        from_user_id INT NULL,
        to_user_id INT NOT NULL,
        sector VARCHAR(100) NOT NULL,
        reassigned_by INT NOT NULL,
        reason TEXT,
        reassigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (to_user_id) REFERENCES users(id),
        FOREIGN KEY (reassigned_by) REFERENCES users(id)
      )
    `);
    console.log('Created sl_reassignments');
  }

  await connection.end();
  console.log('Sector Lead reassignment migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

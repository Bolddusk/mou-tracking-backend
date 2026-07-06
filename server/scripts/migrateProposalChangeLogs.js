require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return Number(rows[0].cnt) > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await tableExists(connection, 'proposal_change_logs'))) {
    await connection.query(`
      CREATE TABLE proposal_change_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        proposal_id INT NOT NULL,
        changed_by INT NOT NULL,
        changed_by_role VARCHAR(50) NOT NULL,
        changed_by_name VARCHAR(255) NOT NULL,
        action VARCHAR(80) NOT NULL,
        summary VARCHAR(500) NULL,
        changes JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_proposal_created (proposal_id, created_at DESC),
        INDEX idx_changed_by (changed_by),
        FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id)
      )
    `);
    console.log('Created proposal_change_logs table');
  } else {
    console.log('proposal_change_logs table already exists');
  }

  await connection.end();
  console.log('Proposal change logs migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

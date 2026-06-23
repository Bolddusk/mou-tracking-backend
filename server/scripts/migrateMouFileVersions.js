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

  if (!(await tableExists(connection, 'mou_file_versions'))) {
    await connection.query(`
      CREATE TABLE mou_file_versions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        proposal_id INT NULL,
        match_id INT NULL,
        file_url VARCHAR(500) NOT NULL,
        uploaded_by INT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        version_number INT NOT NULL DEFAULT 1,
        FOREIGN KEY (uploaded_by) REFERENCES users(id),
        INDEX idx_mou_versions_proposal (proposal_id),
        INDEX idx_mou_versions_match (match_id)
      )
    `);
    console.log('Created mou_file_versions');
  }

  await connection.end();
  console.log('MOU file versions migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

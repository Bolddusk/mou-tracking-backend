require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (await tableExists(connection, 'mm_pakistan_proposals')) {
    console.log('mm_pakistan_proposals already exists — skip');
    await connection.end();
    return;
  }

  await connection.query(`
    CREATE TABLE mm_pakistan_proposals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      party_a_id INT NOT NULL,
      sector VARCHAR(100) NOT NULL DEFAULT '',
      proposal_title VARCHAR(255) NOT NULL DEFAULT '',
      proposal_description TEXT,
      proposal_file_url VARCHAR(500),
      engagement_type ENUM('G2G','B2B','B2G','G2B') NULL,
      conference_info JSON NULL,
      party_a_info JSON NULL,
      company_name VARCHAR(255) NULL,
      company_logo_url VARCHAR(500) NULL,
      cover_image_url VARCHAR(500) NULL,
      project_type ENUM('Greenfield','Brownfield') NULL,
      venture_name VARCHAR(255) NULL,
      executive_summary JSON NULL,
      company_overview JSON NULL,
      project_overview JSON NULL,
      financials JSON NULL,
      investment_ask JSON NULL,
      contact_info JSON NULL,
      status ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
      submitted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (party_a_id) REFERENCES users(id)
    )
  `);

  console.log('Created mm_pakistan_proposals');
  await connection.end();
  console.log('Matchmaking Pakistan migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

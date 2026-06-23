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

  if (await tableExists(connection, 'mm_china_proposals')) {
    console.log('mm_china_proposals already exists — skip');
    await connection.end();
    return;
  }

  await connection.query(`
    CREATE TABLE mm_china_proposals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      uploaded_by_rfp INT NOT NULL,
      sector VARCHAR(100) NOT NULL DEFAULT '',
      proposal_title VARCHAR(255) NOT NULL DEFAULT '',
      proposal_description TEXT,
      proposal_file_url VARCHAR(500),
      engagement_type ENUM('G2G','B2B','B2G','G2B') NULL,
      conference_info JSON NULL,
      party_b_entity_type ENUM('government','business') NULL,
      party_b_name VARCHAR(100) NULL,
      party_b_organization VARCHAR(100) NULL,
      party_b_email VARCHAR(150) NULL,
      party_b_phone VARCHAR(20) NULL,
      party_b_country VARCHAR(100) NULL,
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
      status ENUM('active','archived') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by_rfp) REFERENCES users(id)
    )
  `);

  console.log('Created mm_china_proposals');
  await connection.end();
  console.log('Matchmaking China migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

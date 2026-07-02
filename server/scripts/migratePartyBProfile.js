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

  if (!(await tableExists(connection, 'party_b_profiles'))) {
    await connection.query(`
      CREATE TABLE party_b_profiles (
        user_id INT PRIMARY KEY,
        company_name VARCHAR(255) NULL,
        registration_number VARCHAR(100) NULL,
        country VARCHAR(100) NULL DEFAULT 'China',
        address TEXT NULL,
        phone VARCHAR(30) NULL,
        website VARCHAR(255) NULL,
        tax_id VARCHAR(100) NULL,
        company_reg_number VARCHAR(100) NULL,
        company_description TEXT NULL,
        sectors JSON NULL,
        hs_codes VARCHAR(255) NULL,
        business_license_issue_date DATE NULL,
        business_license_authority VARCHAR(150) NULL,
        company_reg_date DATE NULL,
        profile_complete TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Created party_b_profiles');
  }

  if (!(await tableExists(connection, 'party_b_profile_documents'))) {
    await connection.query(`
      CREATE TABLE party_b_profile_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        doc_type ENUM('business_license','registration_certificate','other') NOT NULL,
        title VARCHAR(255) NULL,
        description TEXT NULL,
        file_url VARCHAR(500) NOT NULL,
        original_filename VARCHAR(255) NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_party_b_profile_docs_user (user_id),
        INDEX idx_party_b_profile_docs_type (user_id, doc_type)
      )
    `);
    console.log('Created party_b_profile_documents');
  }

  await connection.end();
  console.log('Party B profile migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

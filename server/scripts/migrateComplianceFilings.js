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

  if (await tableExists(connection, 'compliance_filings')) {
    console.log('compliance_filings already exists — skip');
  } else {
    await connection.query(`
      CREATE TABLE compliance_filings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        fiscal_year SMALLINT NOT NULL,
        filing_type ENUM('audit_report', 'annual_return') NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        original_filename VARCHAR(255) NULL,
        notes TEXT NULL,
        uploaded_by INT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id),
        UNIQUE KEY uq_compliance_filing (user_id, fiscal_year, filing_type),
        INDEX idx_compliance_user (user_id),
        INDEX idx_compliance_year (fiscal_year)
      )
    `);
    console.log('Created compliance_filings');
  }

  await connection.end();
  console.log('Compliance filings migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

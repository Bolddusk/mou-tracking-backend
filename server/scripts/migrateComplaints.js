require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT NOT NULL,
  filed_by INT NOT NULL,
  tagged_sector_lead INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  document_url VARCHAR(500),
  status ENUM('open','under_review','resolved','rejected','forwarded') DEFAULT 'open',
  forwarded_to INT NULL,
  forwarded_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id),
  FOREIGN KEY (filed_by) REFERENCES users(id),
  FOREIGN KEY (tagged_sector_lead) REFERENCES users(id),
  FOREIGN KEY (forwarded_to) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS complaint_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  commented_by INT NOT NULL,
  commented_by_role ENUM('party_a','sector_lead','super_admin','regional_focal_point') NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id),
  FOREIGN KEY (commented_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS complaint_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  action_by INT NOT NULL,
  action_by_role ENUM('sector_lead','super_admin','regional_focal_point') NOT NULL,
  action ENUM('approved','rejected','forwarded') NOT NULL,
  comment TEXT,
  actioned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id),
  FOREIGN KEY (action_by) REFERENCES users(id)
);
`;

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  for (const statement of TABLES_SQL.split(';').filter((s) => s.trim())) {
    await connection.query(statement);
  }

  await connection.end();
  console.log('Complaint tables created successfully.');
}

migrate().catch((err) => {
  console.error('Complaint migration failed:', err.message);
  process.exit(1);
});

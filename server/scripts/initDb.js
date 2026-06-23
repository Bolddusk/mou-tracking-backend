require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const TABLES_SQL = `
DROP TABLE IF EXISTS pk_proposals;
DROP TABLE IF EXISTS proposals;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100),
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('super_admin','admin','sector_lead','regional_focal_point','party_a','party_b') NOT NULL,
  sector VARCHAR(100),
  organization VARCHAR(100),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE proposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  party_a_id INT NOT NULL,
  sector VARCHAR(100) NOT NULL DEFAULT '',
  proposal_title VARCHAR(255) NOT NULL DEFAULT '',
  proposal_description TEXT,
  proposal_file_url VARCHAR(500),
  party_b_name VARCHAR(100),
  party_b_organization VARCHAR(100),
  party_b_email VARCHAR(150),
  party_b_phone VARCHAR(20),
  party_b_country VARCHAR(100),
  mou_scope TEXT,
  mou_description TEXT,
  mou_sector VARCHAR(100),
  mou_demand TEXT,
  mou_file_url VARCHAR(500),
  status ENUM('draft','submitted','approved','rejected') DEFAULT 'draft',
  sector_lead_comment TEXT,
  reviewed_by INT NULL,
  submitted_at TIMESTAMP NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (party_a_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);
`;

async function initDb() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;

  const connection = await mysql.createConnection(serverConfig);

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  console.log(`Database "${database}" ready.`);

  await connection.changeUser({ database });

  for (const statement of TABLES_SQL.split(';').filter((s) => s.trim())) {
    await connection.query(statement);
  }

  await connection.end();
  console.log('Tables users + proposals created successfully.');
}

initDb().catch((err) => {
  console.error('Database init failed:', err.message);
  process.exit(1);
});

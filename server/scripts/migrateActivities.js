require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS proposal_activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT NOT NULL,
  added_by INT NOT NULL,
  added_by_role ENUM('party_a','sector_lead','super_admin') NOT NULL,
  activity_date DATE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  support_file_url VARCHAR(500),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id),
  FOREIGN KEY (added_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT NOT NULL,
  commented_by INT NOT NULL,
  commented_by_role ENUM('party_a','sector_lead','super_admin') NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_id) REFERENCES proposal_activities(id),
  FOREIGN KEY (commented_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT NOT NULL,
  action_by INT NOT NULL,
  action_by_role ENUM('sector_lead','super_admin') NOT NULL,
  action ENUM('approved','rejected') NOT NULL,
  comment TEXT,
  actioned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_id) REFERENCES proposal_activities(id),
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
  console.log('Activity tables created successfully.');
}

migrate().catch((err) => {
  console.error('Activity migration failed:', err.message);
  process.exit(1);
});

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS proposal_chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_role ENUM('party_a', 'party_b', 'sector_lead', 'super_admin') NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  INDEX idx_proposal_chat_proposal_created (proposal_id, created_at),
  INDEX idx_proposal_chat_proposal_id (proposal_id, id)
)`;

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  await connection.query(TABLE_SQL);

  await connection.query(`
    ALTER TABLE proposal_chat_messages
    MODIFY sender_role ENUM('party_a', 'party_b', 'sector_lead', 'super_admin') NOT NULL
  `);

  await connection.end();
  console.log('proposal_chat_messages table ready (roles: party_a, party_b, sector_lead, super_admin).');
}

migrate().catch((err) => {
  console.error('Proposal chat migration failed:', err.message);
  process.exit(1);
});

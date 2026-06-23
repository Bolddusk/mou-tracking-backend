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

  if (await tableExists(connection, 'mm_matches')) {
    console.log('mm_matches already exists — skip');
    await connection.end();
    return;
  }

  await connection.query(`
    CREATE TABLE mm_matches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pk_proposal_id INT NOT NULL,
      china_proposal_id INT NOT NULL,
      status ENUM('created','pending_sl_review','approved','rejected') NOT NULL DEFAULT 'created',
      proposed_by_rfp INT NOT NULL,
      proposed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      submitted_for_review_at TIMESTAMP NULL,
      sl_reviewed_by INT NULL,
      sl_reviewed_at TIMESTAMP NULL,
      sl_comment TEXT,
      engagement_proposal_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_mm_pk_china (pk_proposal_id, china_proposal_id),
      FOREIGN KEY (pk_proposal_id) REFERENCES mm_pakistan_proposals(id),
      FOREIGN KEY (china_proposal_id) REFERENCES mm_china_proposals(id),
      FOREIGN KEY (proposed_by_rfp) REFERENCES users(id),
      FOREIGN KEY (sl_reviewed_by) REFERENCES users(id),
      FOREIGN KEY (engagement_proposal_id) REFERENCES proposals(id)
    )
  `);

  console.log('Created mm_matches');
  await connection.end();
  console.log('Matchmaking matches migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

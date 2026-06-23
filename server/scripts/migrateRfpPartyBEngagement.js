require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

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

  if (!(await columnExists(connection, 'complaints', 'party_b_user_id'))) {
    await connection.query('ALTER TABLE complaints ADD COLUMN party_b_user_id INT NULL');
    console.log('Added complaints.party_b_user_id');
  }

  if (!(await columnExists(connection, 'complaints', 'party_b_tagged_at'))) {
    await connection.query('ALTER TABLE complaints ADD COLUMN party_b_tagged_at TIMESTAMP NULL');
    console.log('Added complaints.party_b_tagged_at');
  }

  if (!(await columnExists(connection, 'complaints', 'party_b_tagged_by'))) {
    await connection.query('ALTER TABLE complaints ADD COLUMN party_b_tagged_by INT NULL');
    console.log('Added complaints.party_b_tagged_by');
  }

  if (!(await tableExists(connection, 'complaint_party_b_engagements'))) {
    await connection.query(`
      CREATE TABLE complaint_party_b_engagements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        complaint_id INT NOT NULL,
        type ENUM('tag','poke','comment','poke_response') NOT NULL,
        author_id INT NOT NULL,
        author_role ENUM('regional_focal_point','party_b') NOT NULL,
        comment TEXT NULL,
        document_url VARCHAR(500) NULL,
        responds_to_id INT NULL,
        response_date DATE NULL,
        response_title VARCHAR(255) NULL,
        response_description TEXT NULL,
        response_document_url VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id),
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (responds_to_id) REFERENCES complaint_party_b_engagements(id)
      )
    `);
    console.log('Created complaint_party_b_engagements table');
  }

  await connection.end();
  console.log('RFP–Party B engagement migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

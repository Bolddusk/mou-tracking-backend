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

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await columnExists(connection, 'proposals', 'party_b_user_id'))) {
    await connection.query(
      'ALTER TABLE proposals ADD COLUMN party_b_user_id INT NULL'
    );
    await connection.query(
      'ALTER TABLE proposals ADD CONSTRAINT fk_proposals_party_b_user FOREIGN KEY (party_b_user_id) REFERENCES users(id)'
    );
    console.log('Added proposals.party_b_user_id');
  }

  await connection.query(
    `ALTER TABLE proposal_activities
     MODIFY COLUMN added_by_role ENUM('party_a','party_b','sector_lead','super_admin') NOT NULL`
  );
  console.log('Updated proposal_activities.added_by_role');

  await connection.query(
    `ALTER TABLE activity_comments
     MODIFY COLUMN commented_by_role ENUM('party_a','party_b','sector_lead','super_admin') NOT NULL`
  );
  console.log('Updated activity_comments.commented_by_role');

  await connection.query(
    `ALTER TABLE complaint_comments
     MODIFY COLUMN commented_by_role ENUM('party_a','party_b','sector_lead','super_admin','regional_focal_point') NOT NULL`
  );
  console.log('Updated complaint_comments.commented_by_role');

  await connection.end();
  console.log('Party B migration complete.');
}

migrate().catch((err) => {
  console.error('Party B migration failed:', err.message);
  process.exit(1);
});

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

  if (!(await columnExists(connection, 'proposals', 'engagement_type'))) {
    await connection.query(
      `ALTER TABLE proposals ADD COLUMN engagement_type ENUM('G2G','B2B','B2G','G2B') NULL`
    );
    console.log('Added proposals.engagement_type');
  }

  if (!(await columnExists(connection, 'proposals', 'conference_info'))) {
    await connection.query('ALTER TABLE proposals ADD COLUMN conference_info JSON NULL');
    console.log('Added proposals.conference_info');
  }

  if (!(await columnExists(connection, 'proposals', 'party_a_info'))) {
    await connection.query('ALTER TABLE proposals ADD COLUMN party_a_info JSON NULL');
    console.log('Added proposals.party_a_info');
  }

  if (!(await columnExists(connection, 'proposals', 'party_b_entity_type'))) {
    await connection.query(
      `ALTER TABLE proposals ADD COLUMN party_b_entity_type ENUM('government','business') NULL`
    );
    console.log('Added proposals.party_b_entity_type');
  }

  await connection.end();
  console.log('Proposal engagement migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

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

async function indexExists(connection, table, indexName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await columnExists(connection, 'proposals', 'cooperation_mode'))) {
    await connection.query(`
      ALTER TABLE proposals
      ADD COLUMN cooperation_mode ENUM('mou','jv','agreement') NULL
      AFTER engagement_type
    `);
    console.log('Added proposals.cooperation_mode');
  }

  const optionalColumns = [
    ['investment_value_usd', 'VARCHAR(120) NULL'],
    ['mou_sub_sector', 'VARCHAR(255) NULL'],
    ['jurisdiction', 'VARCHAR(100) NULL'],
    ['signed_copy_status', "VARCHAR(20) NULL"],
    ['external_reference', 'VARCHAR(80) NULL'],
  ];

  for (const [name, def] of optionalColumns) {
    if (!(await columnExists(connection, 'proposals', name))) {
      await connection.query(`ALTER TABLE proposals ADD COLUMN ${name} ${def}`);
      console.log(`Added proposals.${name}`);
    }
  }

  if (!(await indexExists(connection, 'proposals', 'uq_proposals_external_reference'))) {
    await connection.query(`
      CREATE UNIQUE INDEX uq_proposals_external_reference
      ON proposals (external_reference)
    `);
    console.log('Added unique index on proposals.external_reference');
  }

  await connection.end();
  console.log('Cooperation mode migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

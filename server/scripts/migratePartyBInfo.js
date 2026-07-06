require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');
const { buildPartyBInfoFromRow } = require('../utils/partyBInfo');

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

  if (!(await columnExists(connection, 'proposals', 'party_b_info'))) {
    await connection.query('ALTER TABLE proposals ADD COLUMN party_b_info JSON NULL');
    console.log('Added proposals.party_b_info');
  }

  const [rows] = await connection.query(
    `SELECT id, party_b_entity_type, party_b_name, party_b_organization, party_b_email,
            party_b_phone, party_b_country, party_b_info
     FROM proposals
     WHERE party_b_info IS NULL
       AND (
         party_b_name IS NOT NULL OR party_b_organization IS NOT NULL OR
         party_b_email IS NOT NULL OR party_b_phone IS NOT NULL OR party_b_country IS NOT NULL
       )`
  );

  let backfilled = 0;
  for (const row of rows) {
    const info = buildPartyBInfoFromRow(row);
    await connection.query('UPDATE proposals SET party_b_info = ? WHERE id = ?', [
      JSON.stringify(info),
      row.id,
    ]);
    backfilled += 1;
  }

  console.log(`Backfilled party_b_info for ${backfilled} proposal(s)`);
  await connection.end();
  console.log('Party B info migration complete.');
}

migrate().catch((err) => {
  console.error('Party B info migration failed:', err.message);
  process.exit(1);
});

/**
 * Backfill conference_key on Islamabad imported MOUs (if missing).
 *   npm run db:backfill:islamabad-conference-fields
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');
const { ISLAMABAD_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');

const ISLAMABAD_PREFIXES = [
  'ISLAMABAD-AGRI-TECH-',
  'ISLAMABAD-AGRI-B2B-',
  'ISLAMABAD-AGRI-INPUTS-',
  'ISLAMABAD-AGRI-COLDCHAIN-',
  'ISLAMABAD-AGRI-PACKAGING-',
  'ISLAMABAD-AGRI-FRUIT-',
  'ISLAMABAD-AGRI-FISHERIES-',
];

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  const conferenceInfo = JSON.stringify(buildConferenceInfo(ISLAMABAD_AGRI_2026));
  let total = 0;

  for (const prefix of ISLAMABAD_PREFIXES) {
    const [result] = await connection.query(
      `UPDATE proposals
       SET conference_key = ?,
           conference_name = ?,
           conference_info = COALESCE(conference_info, ?)
       WHERE external_reference LIKE ?
         AND (conference_key IS NULL OR conference_key = '')`,
      [ISLAMABAD_AGRI_2026.key, ISLAMABAD_AGRI_2026.name, conferenceInfo, `${prefix}%`]
    );
    if (result.affectedRows) {
      console.log(`Backfilled ${result.affectedRows} row(s) for ${prefix}*`);
    }
    total += result.affectedRows;
  }

  console.log(`\nTotal Islamabad conference fields backfilled: ${total}`);
  await connection.end();
}

migrate().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});

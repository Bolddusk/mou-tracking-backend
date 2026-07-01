/**
 * Backfill sector on Islamabad Agri Inputs imports.
 *   npm run db:backfill:islamabad-agri-inputs-sector
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');

const PORTAL_SECTOR = 'Agri Technology & Precision Agriculture Solutions';

async function backfill() {
  const [result] = await pool.query(
    `UPDATE proposals
     SET sector = ?, mou_sector = ?
     WHERE external_reference LIKE 'ISLAMABAD-AGRI-INPUTS-%'`,
    [PORTAL_SECTOR, PORTAL_SECTOR]
  );

  console.log(`Updated sector on ${result.affectedRows} proposal(s) → "${PORTAL_SECTOR}"`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});

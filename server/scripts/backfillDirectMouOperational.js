require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { persistOperationalSyncForProposal } = require('../utils/directMouOperationalSync');

async function backfill() {
  const [rows] = await pool.query(
    `SELECT *
     FROM proposals
     WHERE deleted_at IS NULL
       AND (
         investment_value_usd IS NULL
         OR cooperation_mode IS NULL
         OR proposal_description IS NULL
         OR conference_name IS NULL
         OR executive_summary IS NULL
         OR executive_summary NOT LIKE '%sifc_category%'
         OR executive_summary NOT LIKE '%mou_operational_status%'
         OR executive_summary NOT LIKE '%progress%'
       )`
  );

  let updated = 0;
  for (const row of rows) {
    const result = await persistOperationalSyncForProposal(pool, row);
    if (result.updated) updated += 1;
  }

  console.log(`Direct MOU operational sync backfill complete. Updated ${updated} of ${rows.length} candidates.`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});

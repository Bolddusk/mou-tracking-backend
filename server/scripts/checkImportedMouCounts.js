/**
 * Show imported MOU counts by batch (local or live — uses .env DB).
 *   npm run db:check:imported-mous
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');

const BATCHES = [
  { label: 'Hangzhou Excel', prefix: 'HANGZHOU-AGRI-', expected: 43 },
  { label: 'Islamabad Tech', prefix: 'ISLAMABAD-AGRI-TECH-', expected: 10 },
  { label: 'Islamabad B2B', prefix: 'ISLAMABAD-AGRI-B2B-', expected: 14 },
  { label: 'Islamabad Inputs', prefix: 'ISLAMABAD-AGRI-INPUTS-', expected: 27 },
  { label: 'Islamabad Cold Chain', prefix: 'ISLAMABAD-AGRI-COLDCHAIN-', expected: 7 },
  { label: 'Islamabad Packaging', prefix: 'ISLAMABAD-AGRI-PACKAGING-', expected: 7 },
  { label: 'Islamabad Fruit', prefix: 'ISLAMABAD-AGRI-FRUIT-', expected: 2 },
  { label: 'Islamabad Fisheries', prefix: 'ISLAMABAD-AGRI-FISHERIES-', expected: 1 },
];

async function main() {
  console.log('\n=== Imported MOU count check ===\n');

  let islamabadInFilter = 0;

  for (const batch of BATCHES) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(conference_key IS NOT NULL AND conference_key != '') AS with_key,
              SUM(conference_key IS NULL OR conference_key = '') AS missing_key
       FROM proposals
       WHERE external_reference LIKE ?`,
      [`${batch.prefix}%`]
    );

    const total = Number(row.total) || 0;
    const ok = total === batch.expected ? 'OK' : total < batch.expected ? 'MISSING' : 'EXTRA';
    console.log(
      `[${ok}] ${batch.label.padEnd(22)} ${String(total).padStart(3)} / ${batch.expected}  (conference_key set: ${row.with_key}, missing: ${row.missing_key})`
    );

    if (batch.prefix.startsWith('ISLAMABAD')) {
      islamabadInFilter += Number(row.with_key) || 0;
    }
  }

  const [[hangzhouFilter]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM proposals WHERE conference_key = 'pak-china-hangzhou-agri-2026'`
  );
  const [[islamabadFilter]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM proposals WHERE conference_key = 'pak-china-islamabad-agri-2026'`
  );
  const [[totalApproved]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM proposals WHERE status = 'approved'`
  );

  console.log('\n--- UI filter counts (conference_key set) ---');
  console.log(`Hangzhou in dropdown:  ${hangzhouFilter.cnt} (expected 43)`);
  console.log(`Islamabad in dropdown: ${islamabadFilter.cnt} (expected 68)`);
  console.log(`Approved proposals:    ${totalApproved.cnt}`);

  const missingIslamabad = 68 - Number(islamabadFilter.cnt);
  if (missingIslamabad > 0) {
    console.log(`\n>>> Islamabad short by ${missingIslamabad} record(s) in UI filter.`);
    console.log('>>> Run missing import scripts (see output above for MISSING batches).');
  } else {
    console.log('\nAll Islamabad batches present for UI filter.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Check failed:', err.message);
  process.exit(1);
});

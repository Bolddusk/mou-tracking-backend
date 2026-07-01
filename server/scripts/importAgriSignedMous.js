/**
 * Import historic signed Agriculture MOUs from Excel into proposals table.
 *
 * Run once (idempotent via external_reference):
 *   npm run db:migrate:cooperation-mode
 *   npm run db:import:agri-signed-mous
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const path = require('path');
const pool = require('../config/db');
const {
  DEFAULT_EXCEL,
  readAgriMouRows,
  buildProposalRecord,
} = require('../utils/agriMouImport');

const PARTY_A_EMAIL = process.env.IMPORT_PARTY_A_EMAIL || 'superadmin@test.com';
const SECTOR_LEAD_EMAIL = process.env.IMPORT_SECTOR_LEAD_EMAIL || 'sectorlead@test.com';
const EXCEL_PATH = process.env.AGRI_MOU_EXCEL_PATH || DEFAULT_EXCEL;

async function requireUser(email, label) {
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE email = ?', [email]);
  if (!rows.length) {
    throw new Error(`${label} not found (${email}). Run: npm run db:seed`);
  }
  return rows[0];
}

async function findExistingReference(externalReference) {
  const [rows] = await pool.query(
    'SELECT id, external_reference FROM proposals WHERE external_reference = ? LIMIT 1',
    [externalReference]
  );
  return rows[0] || null;
}

async function insertProposal(row) {
  const cols = Object.keys(row);
  const [result] = await pool.query(
    `INSERT INTO proposals (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(row)
  );
  return result.insertId;
}

async function importRows() {
  console.log(`\n=== Import Agri signed MOUs ===`);
  console.log(`Excel: ${EXCEL_PATH}`);

  const partyA = await requireUser(PARTY_A_EMAIL, 'Import Party A owner');
  const sectorLead = await requireUser(SECTOR_LEAD_EMAIL, 'Sector Lead reviewer');
  const rows = await readAgriMouRows(EXCEL_PATH);

  console.log(`Found ${rows.length} MOU rows in Excel\n`);

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = await findExistingReference(row.external_reference);
    if (existing) {
      console.log(`Skip (exists): Sr ${row.sr} → proposal #${existing.id}`);
      skipped += 1;
      continue;
    }

    const proposal = buildProposalRecord(row, partyA.id, sectorLead.id);
    const proposalId = await insertProposal(proposal);
    console.log(
      `Imported Sr ${row.sr} → proposal #${proposalId} [${row.cooperation_mode.toUpperCase()}] ${row.venture_name}`
    );
    inserted += 1;
  }

  console.log('\n--- Summary ---');
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Total:    ${rows.length}`);
  process.exit(0);
}

importRows().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});

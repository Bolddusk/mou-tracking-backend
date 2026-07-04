/**
 * QA fixes for imported conference MOUs already in DB:
 * - Swap reversed Chinese/Pakistani company names where detected
 * - Trim proposal_description / mou_description to outcome only
 *
 * Run: npm run db:backfill:qa-mou-fixes
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const {
  normalizeCompanyPair,
  buildVentureTitle,
  extractOutcomeFromStored,
} = require('../utils/mouImportHelpers');

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function main() {
  console.log('\n=== Backfill QA MOU fixes ===\n');

  const [rows] = await pool.query(
    `SELECT id, company_name, party_b_name, party_b_organization, party_a_info,
            venture_name, proposal_title, proposal_description, mou_description, executive_summary
     FROM proposals
     WHERE conference_key IS NOT NULL`
  );

  let companiesFixed = 0;
  let descriptionsFixed = 0;

  for (const row of rows) {
    const executiveSummary = parseJson(row.executive_summary, {});
    const partyAInfo = parseJson(row.party_a_info, {});

    const pair = normalizeCompanyPair(row.party_b_name, row.company_name);
    const pakistani = pair.pakistani;
    const chinese = pair.chinese;
    const outcome = extractOutcomeFromStored(row.proposal_description, executiveSummary);

    const nextPartyAInfo = {
      ...partyAInfo,
      organization_name: pakistani,
      contact_name: pakistani,
      country: partyAInfo.country || 'Pakistan',
    };
    const nextExecutiveSummary = {
      ...executiveSummary,
      company_overview: pakistani,
      project_overview: outcome || executiveSummary.project_overview || '',
    };
    const ventureName = buildVentureTitle(chinese, pakistani);

    const changedCompanies =
      pair.swapped ||
      row.company_name !== pakistani ||
      row.party_b_name !== chinese ||
      row.party_b_organization !== chinese;

    const changedDescriptions =
      outcome &&
      (row.proposal_description !== outcome || row.mou_description !== outcome);

    if (!changedCompanies && !changedDescriptions) continue;

    await pool.query(
      `UPDATE proposals
       SET company_name = ?,
           party_b_name = ?,
           party_b_organization = ?,
           party_a_info = ?,
           venture_name = ?,
           proposal_title = ?,
           proposal_description = ?,
           mou_description = ?,
           executive_summary = ?
       WHERE id = ?`,
      [
        pakistani,
        chinese,
        chinese,
        JSON.stringify(nextPartyAInfo),
        ventureName,
        ventureName,
        outcome || row.proposal_description,
        outcome || row.mou_description,
        JSON.stringify(nextExecutiveSummary),
        row.id,
      ]
    );

    if (pair.swapped) companiesFixed += 1;
    if (changedDescriptions) descriptionsFixed += 1;
  }

  console.log(`Processed: ${rows.length} conference MOU(s)`);
  console.log(`Company pairs corrected: ${companiesFixed}`);
  console.log(`Descriptions trimmed:    ${descriptionsFixed}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});

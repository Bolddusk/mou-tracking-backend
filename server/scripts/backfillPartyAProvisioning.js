/**
 * Link Party A user accounts for proposals where party_a_id still points
 * to a staff placeholder (e.g. super_admin who created a Direct MOU draft).
 *
 * Usage: npm run db:backfill:party-a-provisioning
 */
require('dotenv').config();
const pool = require('../config/db');
const { provisionPartyAForProposal } = require('../utils/partyAProvisioner');

async function main() {
  const [rows] = await pool.query(
    `SELECT p.*
     FROM proposals p
     JOIN users u ON u.id = p.party_a_id
     WHERE u.role != 'party_a'
       AND JSON_EXTRACT(p.party_a_info, '$.email') IS NOT NULL
       AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(p.party_a_info, '$.email'))) != ''
       AND p.status != 'draft'
     ORDER BY p.id`
  );

  console.log(`Found ${rows.length} proposal(s) needing Party A provisioning`);

  for (const row of rows) {
    const result = await provisionPartyAForProposal(row);
    console.log(`Proposal ${row.id}:`, result);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

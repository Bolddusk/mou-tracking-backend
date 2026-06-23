require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const pool = require('../config/db');

const SECTOR = 'Agri-chemicals & Inputs';

(async () => {
  const [[sl]] = await pool.query(
    "SELECT id FROM users WHERE email = 'sectorlead@test.com' AND role = 'sector_lead'"
  );
  if (!sl) {
    console.error('sectorlead@test.com not found');
    process.exit(1);
  }

  const [c] = await pool.query(
    `UPDATE complaints c
     JOIN proposals p ON p.id = c.proposal_id
     LEFT JOIN users u ON u.id = c.tagged_sector_lead
     SET c.tagged_sector_lead = ?
     WHERE p.sector = ?
       AND c.status NOT IN ('resolved', 'rejected')
       AND (u.id IS NULL OR u.role != 'sector_lead')`,
    [sl.id, SECTOR]
  );

  const [cn] = await pool.query(
    `UPDATE mm_china_proposals c
     LEFT JOIN users u ON u.id = c.forwarded_to_sl
     SET c.forwarded_to_sl = ?
     WHERE c.sector = ?
       AND c.forwarded_to_sl IS NOT NULL
       AND c.status NOT IN ('approved', 'rejected')
       AND (u.id IS NULL OR u.role != 'sector_lead')`,
    [sl.id, SECTOR]
  );

  console.log(`Orphans fixed → complaints: ${c.affectedRows}, china: ${cn.affectedRows}`);
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

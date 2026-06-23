require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const pool = require('../config/db');

(async () => {
  const [rows] = await pool.query(
    `SELECT id, status, venture_name, company_name, party_b_email, party_b_name, party_b_user_id
     FROM proposals WHERE id = 12 OR party_b_email LIKE '%gmail%' OR venture_name LIKE '%AVRIO%'
     ORDER BY id`
  );
  console.table(rows);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

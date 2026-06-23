require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const pool = require('../config/db');

(async () => {
  const [u] = await pool.query(
    "SELECT id, email, sector FROM users WHERE email = 'sectorlead@test.com'"
  );
  console.log('Sector lead:', u[0]);

  const [rows] = await pool.query(
    `SELECT id, status, sector, venture_name, submitted_at
     FROM proposals
     WHERE sector = ? OR id >= 19
     ORDER BY id DESC`,
    [u[0]?.sector || '']
  );
  console.table(rows);
  process.exit(0);
})();

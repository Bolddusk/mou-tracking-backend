/**
 * Seed one sector_lead user per active sector.
 * Login email: {sector-slug}-sectorlead@test.com
 * Password (all): password123
 *
 * Run: npm run db:seed:sector-leads
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { listActiveSectors } = require('../utils/sectorRegistry');
const { DEFAULT_SECTOR_LEAD_EMAIL, LEGACY_SECTOR_LEAD_EMAIL } = require('../constants/seedDefaults');
const { replaceAssignments } = require('../utils/sectorLeadAssignments');

const PASSWORD = 'password123';
const EMAIL_DOMAIN = process.env.SECTOR_LEAD_EMAIL_DOMAIN || 'test.com';

function sectorToSlug(sectorName) {
  return String(sectorName)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildSectorLeadEmail(sectorName) {
  return `${sectorToSlug(sectorName)}-sectorlead@${EMAIL_DOMAIN}`;
}

async function upsertSectorLead({ sector, email }) {
  const fullName = `Sector Lead — ${sector}`;
  const organization = 'Ministry of National Food Security & Research';
  const phone = `0300${String(sectorToSlug(sector).length).padStart(2, '0')}0000`;

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  if (existing.length) {
    await pool.query(
      `UPDATE users
       SET full_name = ?, password = ?, role = 'sector_lead', sector = ?, organization = ?, phone = ?, must_change_password = 0
       WHERE email = ?`,
      [fullName, hashedPassword, sector, organization, phone, email]
    );
    const [[user]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    await replaceAssignments(user.id, [sector], { primarySector: sector });
    return { email, sector, action: 'updated' };
  }

  await pool.query(
    `INSERT INTO users (full_name, email, password, role, sector, organization, phone, must_change_password)
     VALUES (?, ?, ?, 'sector_lead', ?, ?, ?, 0)`,
    [fullName, email, hashedPassword, sector, organization, phone]
  );
  const [[user]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  await replaceAssignments(user.id, [sector], { primarySector: sector });
  return { email, sector, action: 'created' };
}

async function removeLegacySectorLead() {
  const [[oldUser]] = await pool.query('SELECT id FROM users WHERE email = ?', [LEGACY_SECTOR_LEAD_EMAIL]);
  if (!oldUser) {
    console.log(`\nLegacy ${LEGACY_SECTOR_LEAD_EMAIL} not found (already removed).`);
    return;
  }

  const [[newUser]] = await pool.query('SELECT id FROM users WHERE email = ?', [DEFAULT_SECTOR_LEAD_EMAIL]);
  if (!newUser) {
    throw new Error(`Cannot remove legacy SL — ${DEFAULT_SECTOR_LEAD_EMAIL} not found. Run seed first.`);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const reassignments = [
      ['proposals', 'reviewed_by'],
      ['proposals', 'deal_closed_by'],
      ['complaints', 'tagged_sector_lead'],
      ['complaints', 'forwarded_to'],
      ['mm_proposals', 'reviewed_by'],
      ['mm_proposals', 'forwarded_to'],
    ];

    for (const [table, column] of reassignments) {
      try {
        const [result] = await connection.query(
          `UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`,
          [newUser.id, oldUser.id]
        );
        if (result.affectedRows > 0) {
          console.log(`Reassigned ${result.affectedRows} ${table}.${column} → new Agri sector lead`);
        }
      } catch (err) {
        if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') {
          throw err;
        }
      }
    }

    await connection.query('DELETE FROM users WHERE id = ?', [oldUser.id]);
    await connection.commit();
    console.log(`\nRemoved legacy account: ${LEGACY_SECTOR_LEAD_EMAIL}`);
    console.log(`Use instead: ${DEFAULT_SECTOR_LEAD_EMAIL}`);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function main() {
  const sectors = await listActiveSectors();
  if (!sectors.length) {
    console.error('No active sectors found. Run: npm run db:migrate:sectors');
    process.exit(1);
  }

  console.log(`\n=== Seed sector leads (${sectors.length} sectors) ===`);
  console.log(`Password for all: ${PASSWORD}\n`);

  const results = [];
  for (const row of sectors) {
    const email = buildSectorLeadEmail(row.name);
    const result = await upsertSectorLead({ sector: row.name, email });
    results.push(result);
    console.log(`${result.action === 'created' ? 'Created' : 'Updated'}: ${email}`);
    console.log(`  Sector: ${row.name}`);
  }

  console.log('\n--- Login credentials ---');
  results.forEach(({ email, sector }) => {
    console.log(`${email.padEnd(72)} / ${PASSWORD}  (${sector})`);
  });

  await removeLegacySectorLead();

  process.exit(0);
}

main().catch((err) => {
  console.error('Seed sector leads failed:', err.message);
  process.exit(1);
});

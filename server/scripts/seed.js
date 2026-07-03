require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { DEFAULT_SECTOR_LEAD_EMAIL } = require('../constants/seedDefaults');

const TEST_USERS = [
  {
    full_name: 'Party A — Ali Khan',
    email: 'partya@test.com',
    password: 'password123',
    role: 'party_a',
    sector: null,
    organization: 'Khan Industries Pvt Ltd',
    phone: '03001234567',
  },
  {
    full_name: 'Party A — Sara Ahmed',
    email: 'partya2@test.com',
    password: 'password123',
    role: 'party_a',
    sector: null,
    organization: 'GreenTech Pakistan',
    phone: '03009876543',
  },
  {
    full_name: 'Super Admin',
    email: 'superadmin@test.com',
    password: 'password123',
    role: 'super_admin',
    sector: null,
    organization: 'Investment Portal HQ',
    phone: '03009998877',
  },
  {
    full_name: 'Regional Focal Point — Punjab',
    email: 'rfp@test.com',
    password: 'password123',
    role: 'regional_focal_point',
    sector: 'Punjab Region',
    organization: 'Regional Investment Office',
    phone: '03001112233',
  },
  {
    full_name: 'Regional Focal Point — Sindh',
    email: 'rfp2@test.com',
    password: 'password123',
    role: 'regional_focal_point',
    sector: 'Sindh Region',
    organization: 'Sindh Investment Promotion Agency',
    phone: '03004445566',
  },
  {
    full_name: 'Li Wei — SinoAgri',
    email: 'investor@test.com',
    password: 'password123',
    role: 'chinese_investor',
    sector: null,
    organization: 'SinoAgri Corp',
    phone: '+86-138-0000-5678',
  },
];

async function seed() {
  for (const user of TEST_USERS) {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [
      user.email,
    ]);

    if (existing.length > 0) {
      if (user.email === 'investor@test.com') {
        await pool.query(
          `UPDATE users SET full_name = ?, role = ?, sector = ?, organization = ?, phone = ? WHERE email = ?`,
          [
            user.full_name,
            user.role,
            user.sector,
            user.organization,
            user.phone,
            user.email,
          ]
        );
        console.log(`Updated: ${user.email} (${user.role} profile synced)`);
      } else {
        console.log(`Skip (exists): ${user.email}`);
      }
      continue;
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);
    await pool.query(
      `INSERT INTO users (full_name, email, password, role, sector, organization, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.full_name,
        user.email,
        hashedPassword,
        user.role,
        user.sector,
        user.organization,
        user.phone,
      ]
    );
    console.log(`Created: ${user.email} (${user.role})`);
  }

  console.log('\n--- Test Credentials ---');
  console.log('Party A #1:    partya@test.com       / password123  (Khan Industries)');
  console.log('Party A #2:    partya2@test.com      / password123  (GreenTech Pakistan)');
  console.log(`Sector Leads:  npm run db:seed:sector-leads  (e.g. ${DEFAULT_SECTOR_LEAD_EMAIL})`);
  console.log('Super Admin:   superadmin@test.com   / password123');
  console.log('Regional FP:   rfp@test.com            / password123  (Punjab Region)');
  console.log('Regional FP:   rfp2@test.com           / password123  (Sindh Region)');
  console.log('CN Investor:   investor@test.com       / password123  (SinoAgri Corp)');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

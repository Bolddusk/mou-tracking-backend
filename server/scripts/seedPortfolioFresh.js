/**
 * Full portfolio reseed:
 * - Delete all MOUs (proposals) and related rows
 * - Replace sectors, SIFC categories, conferences
 * - Recreate sector leads (real names from portfolio)
 * - Import 3 conference JSON files (174 MOUs)
 *
 * Run: npm run db:seed:portfolio-fresh
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { SECTORS } = require('../constants/sectors');
const { DEFAULT_SIFC_CATEGORIES } = require('../constants/sifcCategories');
const {
  PORTFOLIO_SECTOR_LEADS,
  PORTFOLIO_CONFERENCES,
  buildSectorLeadEmail,
  sectorToSlug,
} = require('../constants/portfolioSeed');
const { loadConferenceMouRows, buildProposalRecord } = require('../utils/conferenceMouJsonImport');
const { refreshSectorCache } = require('../utils/sectorRegistry');
const { refreshConferenceCache } = require('../utils/conferenceRegistry');
const { refreshSifcCategoryCache } = require('../utils/sifcCategoryRegistry');
const { LEGACY_SECTOR_LEAD_EMAIL } = require('../constants/seedDefaults');

const PASSWORD = 'password123';
const EMAIL_DOMAIN = process.env.SECTOR_LEAD_EMAIL_DOMAIN || 'test.com';
const PARTY_A_EMAIL = process.env.IMPORT_PARTY_A_EMAIL || 'superadmin@test.com';
const REPO_ROOT = path.join(__dirname, '..', '..');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function deleteProposalsByIds(connection, proposalIds) {
  if (!proposalIds.length) return;

  const [complaints] = await connection.query(
    'SELECT id FROM complaints WHERE proposal_id IN (?)',
    [proposalIds]
  );
  const complaintIds = complaints.map((row) => row.id);

  if (complaintIds.length) {
    await connection.query('DELETE FROM complaint_comments WHERE complaint_id IN (?)', [complaintIds]);
    await connection.query('DELETE FROM complaint_actions WHERE complaint_id IN (?)', [complaintIds]);
    await connection.query('DELETE FROM complaints WHERE id IN (?)', [complaintIds]);
  }

  const [activities] = await connection.query(
    'SELECT id FROM proposal_activities WHERE proposal_id IN (?)',
    [proposalIds]
  );
  const activityIds = activities.map((row) => row.id);
  if (activityIds.length) {
    if (await tableExists(connection, 'activity_comments')) {
      await connection.query('DELETE FROM activity_comments WHERE activity_id IN (?)', [activityIds]);
    }
    if (await tableExists(connection, 'activity_approvals')) {
      await connection.query('DELETE FROM activity_approvals WHERE activity_id IN (?)', [activityIds]);
    }
  }

  await connection.query('DELETE FROM proposal_chat_messages WHERE proposal_id IN (?)', [proposalIds]);
  await connection.query('DELETE FROM proposal_activities WHERE proposal_id IN (?)', [proposalIds]);
  await connection.query('DELETE FROM mou_file_versions WHERE proposal_id IN (?)', [proposalIds]);
  await connection.query('DELETE FROM proposals WHERE id IN (?)', [proposalIds]);
}

async function deleteAllProposals(connection) {
  const [rows] = await connection.query('SELECT id FROM proposals');
  const ids = rows.map((row) => row.id);
  console.log(`Removing ${ids.length} existing proposal(s)...`);
  await deleteProposalsByIds(connection, ids);
}

async function replaceSectors(connection) {
  if (!(await tableExists(connection, 'sectors'))) {
    await connection.query(`
      CREATE TABLE sectors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Created sectors table');
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('DELETE FROM sectors');
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  for (let index = 0; index < SECTORS.length; index += 1) {
    await connection.query('INSERT INTO sectors (name, sort_order, is_active) VALUES (?, ?, 1)', [
      SECTORS[index],
      index + 1,
    ]);
  }
  console.log(`Seeded ${SECTORS.length} sector(s)`);
}

async function replaceSifcCategories(connection) {
  if (!(await tableExists(connection, 'sifc_categories'))) {
    await connection.query(`
      CREATE TABLE sifc_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Created sifc_categories table');
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('DELETE FROM sifc_categories');
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  for (let index = 0; index < DEFAULT_SIFC_CATEGORIES.length; index += 1) {
    await connection.query('INSERT INTO sifc_categories (name, sort_order, is_active) VALUES (?, ?, 1)', [
      DEFAULT_SIFC_CATEGORIES[index],
      index + 1,
    ]);
  }
  console.log(`Seeded ${DEFAULT_SIFC_CATEGORIES.length} SIFC categor(ies)`);
}

async function replaceConferences(connection) {
  if (!(await tableExists(connection, 'conferences'))) {
    await connection.query(`
      CREATE TABLE conferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conference_key VARCHAR(120) NOT NULL UNIQUE,
        name VARCHAR(500) NOT NULL,
        conference_date DATE NULL,
        conference_end_date DATE NULL,
        location VARCHAR(255) NULL,
        host VARCHAR(255) NULL,
        report_title VARCHAR(500) NULL,
        engagement_type ENUM('G2G','B2B','B2G','G2B') NULL,
        description TEXT NULL,
        supports_report TINYINT(1) NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Created conferences table');
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('DELETE FROM conferences');
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  for (let index = 0; index < PORTFOLIO_CONFERENCES.length; index += 1) {
    const item = PORTFOLIO_CONFERENCES[index];
    await connection.query(
      `INSERT INTO conferences
        (conference_key, name, conference_date, conference_end_date, location, host, report_title, engagement_type, description, supports_report, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        item.key,
        item.name,
        item.date || null,
        item.end_date || null,
        item.location || null,
        item.host || null,
        item.report_title || null,
        item.engagement_type || 'B2B',
        item.description || null,
        item.supports_report ? 1 : 0,
        index + 1,
      ]
    );
  }
  console.log(`Seeded ${PORTFOLIO_CONFERENCES.length} conference(s)`);
}

async function removeOldSectorLeads(connection) {
  if (await tableExists(connection, 'sector_lead_assignments')) {
    await connection.query('DELETE FROM sector_lead_assignments');
  }

  const [sectorLeads] = await connection.query(`SELECT id, email FROM users WHERE role = 'sector_lead'`);
  if (sectorLeads.length) {
    const ids = sectorLeads.map((row) => row.id);
    await connection.query('DELETE FROM users WHERE id IN (?)', [ids]);
    console.log(`Removed ${ids.length} old sector lead account(s)`);
  }

  const [[legacy]] = await connection.query('SELECT id FROM users WHERE email = ?', [
    LEGACY_SECTOR_LEAD_EMAIL,
  ]);
  if (legacy) {
    await connection.query('DELETE FROM users WHERE id = ?', [legacy.id]);
    console.log(`Removed legacy account: ${LEGACY_SECTOR_LEAD_EMAIL}`);
  }
}

async function createSectorLeads(connection) {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const organization = 'Ministry of National Food Security & Research';
  const bySector = {};

  for (const entry of PORTFOLIO_SECTOR_LEADS) {
    const email = buildSectorLeadEmail(entry.sector, EMAIL_DOMAIN);
    const phone = `0300${String(sectorToSlug(entry.sector).length).padStart(2, '0')}0000`;

    await connection.query(
      `INSERT INTO users (full_name, email, password, role, sector, organization, phone, must_change_password)
       VALUES (?, ?, ?, 'sector_lead', ?, ?, ?, 0)`,
      [entry.full_name, email, hashedPassword, entry.sector, organization, phone]
    );

    const [[user]] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (await tableExists(connection, 'sector_lead_assignments')) {
      await connection.query(
        `INSERT INTO sector_lead_assignments (user_id, sector, is_primary, assigned_by)
         VALUES (?, ?, 1, NULL)`,
        [user.id, entry.sector]
      );
    }
    bySector[entry.sector] = user.id;
    console.log(`Sector lead: ${email} → ${entry.full_name}`);
  }

  return bySector;
}

async function requirePartyA(connection) {
  const [rows] = await connection.query('SELECT id, email FROM users WHERE email = ?', [PARTY_A_EMAIL]);
  if (!rows.length) {
    throw new Error(`Party A owner not found (${PARTY_A_EMAIL}). Run: npm run db:seed`);
  }
  return rows[0];
}

async function insertProposal(connection, row) {
  const cols = Object.keys(row);
  const [result] = await connection.query(
    `INSERT INTO proposals (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(row)
  );
  return result.insertId;
}

async function importConferenceMous(connection, conferenceConfig, partyAId, sectorLeadBySector) {
  const jsonPath = path.join(REPO_ROOT, conferenceConfig.json_file);
  const rows = loadConferenceMouRows(jsonPath, conferenceConfig);
  let inserted = 0;

  for (const row of rows) {
    const sectorLeadId = sectorLeadBySector[row.sector];
    if (!sectorLeadId) {
      throw new Error(`No sector lead for sector: ${row.sector}`);
    }

    const proposal = buildProposalRecord(row, partyAId, sectorLeadId, conferenceConfig);
    await insertProposal(connection, proposal);
    inserted += 1;
  }

  console.log(`Imported ${inserted} MOU(s) for ${conferenceConfig.name}`);
  return inserted;
}

async function main() {
  console.log('\n=== Portfolio fresh seed ===\n');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await deleteAllProposals(connection);
    await replaceSectors(connection);
    await replaceSifcCategories(connection);
    await replaceConferences(connection);
    await removeOldSectorLeads(connection);
    const sectorLeadBySector = await createSectorLeads(connection);
    const partyA = await requirePartyA(connection);

    let totalImported = 0;
    for (const conferenceConfig of PORTFOLIO_CONFERENCES) {
      totalImported += await importConferenceMous(
        connection,
        conferenceConfig,
        partyA.id,
        sectorLeadBySector
      );
    }

    await connection.commit();

    await refreshSectorCache();
    await refreshConferenceCache();
    await refreshSifcCategoryCache();

    const [[sectorCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM sectors');
    const [[sifcCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM sifc_categories');
    const [[conferenceCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM conferences');
    const [[proposalCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM proposals');
    const [[slCount]] = await pool.query(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'sector_lead'`);

    console.log('\n--- Summary ---');
    console.log(`Sectors:      ${sectorCount.cnt} (expected ${SECTORS.length})`);
    console.log(`SIFC:         ${sifcCount.cnt} (expected ${DEFAULT_SIFC_CATEGORIES.length})`);
    console.log(`Conferences:  ${conferenceCount.cnt} (expected ${PORTFOLIO_CONFERENCES.length})`);
    console.log(`Sector leads: ${slCount.cnt} (expected ${PORTFOLIO_SECTOR_LEADS.length})`);
    console.log(`MOUs:         ${proposalCount.cnt} (expected ${totalImported})`);
    console.log('\nRestart the API server (or redeploy) so sector/SIFC/conference caches reload.');
    console.log(`\nPassword for all sector leads: ${PASSWORD}`);
    console.log('Example logins:');
    PORTFOLIO_SECTOR_LEADS.slice(0, 3).forEach((entry) => {
      console.log(`  ${buildSectorLeadEmail(entry.sector, EMAIL_DOMAIN)}`);
    });
    console.log('  ...');
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Portfolio fresh seed failed:', err.message);
  process.exit(1);
});

/**
 * Replace sectors, SIFC categories, and conferences only (no MOU / user changes).
 * Use on live when lookups are stale but MOUs and sector leads are already correct.
 *
 * Run: npm run db:seed:portfolio-lookups
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { SECTORS } = require('../constants/sectors');
const { DEFAULT_SIFC_CATEGORIES } = require('../constants/sifcCategories');
const { PORTFOLIO_CONFERENCES } = require('../constants/portfolioSeed');
const { refreshSectorCache } = require('../utils/sectorRegistry');
const { refreshConferenceCache } = require('../utils/conferenceRegistry');
const { refreshSifcCategoryCache } = require('../utils/sifcCategoryRegistry');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
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
}

async function main() {
  console.log('\n=== Portfolio lookups only (sectors + SIFC + conferences) ===\n');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await replaceSectors(connection);
    await replaceSifcCategories(connection);
    await replaceConferences(connection);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  await refreshSectorCache();
  await refreshSifcCategoryCache();
  await refreshConferenceCache();

  const [[sectorCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM sectors');
  const [[sifcCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM sifc_categories');
  const [[conferenceCount]] = await pool.query('SELECT COUNT(*) AS cnt FROM conferences');

  console.log(`Sectors:     ${sectorCount.cnt} (expected ${SECTORS.length})`);
  console.log(`SIFC:        ${sifcCount.cnt} (expected ${DEFAULT_SIFC_CATEGORIES.length})`);
  console.log(`Conferences: ${conferenceCount.cnt} (expected ${PORTFOLIO_CONFERENCES.length})`);
  console.log('\nDone. Restart API server if UI still shows old data.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Portfolio lookups seed failed:', err.message);
  process.exit(1);
});

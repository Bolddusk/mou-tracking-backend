require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');
const { KNOWN_CONFERENCES } = require('../constants/conferences');
const { DEFAULT_SIFC_CATEGORIES } = require('../constants/sifcCategories');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

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

  let conferenceInserted = 0;
  for (let index = 0; index < KNOWN_CONFERENCES.length; index += 1) {
    const item = KNOWN_CONFERENCES[index];
    const [existing] = await connection.query(
      'SELECT id FROM conferences WHERE conference_key = ?',
      [item.key]
    );
    if (existing.length) continue;

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
        item.description || `Historic signed records imported for ${item.name}.`,
        item.supports_report ? 1 : 0,
        index + 1,
      ]
    );
    conferenceInserted += 1;
  }
  console.log(`Seeded ${conferenceInserted} conference(s) from constants`);

  const [proposalConferences] = await connection.query(
    `SELECT DISTINCT conference_key, conference_name
     FROM proposals
     WHERE conference_key IS NOT NULL AND conference_name IS NOT NULL`
  );

  let fromProposals = 0;
  for (const row of proposalConferences) {
    const [existing] = await connection.query(
      'SELECT id FROM conferences WHERE conference_key = ?',
      [row.conference_key]
    );
    if (existing.length) continue;

    await connection.query(
      `INSERT INTO conferences (conference_key, name, sort_order, is_active)
       VALUES (?, ?, 100, 1)`,
      [row.conference_key, row.conference_name]
    );
    fromProposals += 1;
  }
  console.log(`Seeded ${fromProposals} conference(s) from existing proposals`);

  const seedSifc = new Set(DEFAULT_SIFC_CATEGORIES);
  const [proposalSifc] = await connection.query(
    `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(executive_summary, '$.sifc_category')) AS name
     FROM proposals
     WHERE JSON_EXTRACT(executive_summary, '$.sifc_category') IS NOT NULL`
  );
  proposalSifc.forEach((row) => {
    const name = String(row.name || '').trim();
    if (name && name !== 'null') seedSifc.add(name);
  });

  let sifcInserted = 0;
  let sortOrder = 1;
  for (const name of [...seedSifc].sort()) {
    const [existing] = await connection.query('SELECT id FROM sifc_categories WHERE name = ?', [
      name,
    ]);
    if (existing.length) continue;

    await connection.query(
      'INSERT INTO sifc_categories (name, sort_order, is_active) VALUES (?, ?, 1)',
      [name, sortOrder]
    );
    sifcInserted += 1;
    sortOrder += 1;
  }
  console.log(`Seeded ${sifcInserted} SIFC categor(ies)`);

  await connection.end();
  console.log('Conferences + SIFC categories migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

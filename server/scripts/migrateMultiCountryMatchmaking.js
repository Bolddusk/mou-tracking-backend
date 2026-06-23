require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const TABLES_TO_DROP = ['mm_matches', 'mm_china_proposals', 'mm_pakistan_proposals'];

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function countRows(connection, table) {
  if (!(await tableExists(connection, table))) return 0;
  const [[row]] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
  return row.cnt;
}

async function printPreDropSummary(connection) {
  console.log('\n=== PHASE 1: Pre-drop summary (ALL ROWS WILL BE LOST) ===\n');
  for (const table of TABLES_TO_DROP) {
    const exists = await tableExists(connection, table);
    const count = exists ? await countRows(connection, table) : 0;
    console.log(`  ${table}: ${exists ? `${count} row(s) — WILL DROP` : 'not present'}`);
  }

  if (await tableExists(connection, 'mou_file_versions')) {
    const [[mv]] = await connection.query(
      'SELECT COUNT(*) AS cnt FROM mou_file_versions WHERE match_id IS NOT NULL'
    );
    console.log(
      `\n  mou_file_versions (match_id rows): ${mv.cnt} — will DELETE (table kept)`
    );
  }

  console.log('\n  UNTOUCHED: proposals, users (altered only), mou_file_versions (proposal rows), all other tables');
  console.log('\n=== End pre-drop summary ===\n');
}

async function dropLegacyMatchmakingTables(connection) {
  if (await tableExists(connection, 'mou_file_versions')) {
    const [result] = await connection.query(
      'DELETE FROM mou_file_versions WHERE match_id IS NOT NULL'
    );
    console.log(`Cleared ${result.affectedRows} mou_file_versions row(s) linked to old matches`);
  }

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES_TO_DROP) {
    if (await tableExists(connection, table)) {
      await connection.query(`DROP TABLE \`${table}\``);
      console.log(`Dropped ${table}`);
    }
  }
  if (await tableExists(connection, 'mm_proposals')) {
    await connection.query('DROP TABLE `mm_proposals`');
    console.log('Dropped mm_proposals (re-run cleanup)');
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function createMultiCountryTables(connection) {
  if (await tableExists(connection, 'mm_proposals')) {
    console.log('mm_proposals already exists — skip create');
  } else {
    await connection.query(`
    CREATE TABLE mm_proposals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      submitted_by INT NOT NULL,
      submitter_role VARCHAR(50) NOT NULL,
      country VARCHAR(100) NOT NULL,
      sector VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      investment_amount DECIMAL(15,2) NULL,
      keywords JSON NULL,
      side ENUM('side_a','side_b') NOT NULL,
      status ENUM(
        'draft','submitted','shortlisted','rejected',
        'forwarded','matched'
      ) NOT NULL DEFAULT 'draft',
      forwarded_to INT NULL,
      forwarded_at TIMESTAMP NULL,
      reviewed_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (forwarded_to) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id),
      INDEX idx_mm_proposals_country (country),
      INDEX idx_mm_proposals_sector (sector),
      INDEX idx_mm_proposals_status (status),
      INDEX idx_mm_proposals_side (side)
    )
  `);
    console.log('Created mm_proposals');
  }

  if (await tableExists(connection, 'mm_matches')) {
    console.log('mm_matches already exists — skip create');
  } else {
    await connection.query(`
    CREATE TABLE mm_matches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      side_a_proposal_id INT NOT NULL,
      side_b_proposal_id INT NOT NULL,
      side_a_country VARCHAR(100) NOT NULL,
      side_b_country VARCHAR(100) NOT NULL,
      matched_by INT NOT NULL,
      status ENUM('active','mou_pending','closed') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (side_a_proposal_id) REFERENCES mm_proposals(id),
      FOREIGN KEY (side_b_proposal_id) REFERENCES mm_proposals(id),
      FOREIGN KEY (matched_by) REFERENCES users(id),
      UNIQUE KEY uq_mm_match (side_a_proposal_id, side_b_proposal_id),
      INDEX idx_mm_matches_countries (side_a_country, side_b_country)
    )
  `);
    console.log('Created mm_matches');
  }
}

async function migrateUserRoles(connection) {
  await connection.query(`
    ALTER TABLE users
    MODIFY COLUMN role ENUM(
      'super_admin','admin','sector_lead','regional_focal_point',
      'party_a','party_b','chinese_investor','investor','focal_point'
    ) NOT NULL
  `);
  console.log('Expanded users.role ENUM (added investor, focal_point)');

  const [result] = await connection.query(
    "UPDATE users SET role = 'investor' WHERE role = 'chinese_investor'"
  );
  if (result.affectedRows > 0) {
    console.log(`Migrated ${result.affectedRows} user(s) chinese_investor → investor`);
  }

  await connection.query(`
    ALTER TABLE users
    MODIFY COLUMN role ENUM(
      'super_admin','admin','sector_lead','regional_focal_point',
      'party_a','party_b','investor','focal_point'
    ) NOT NULL
  `);
  console.log('Finalized users.role ENUM (removed chinese_investor)');
}

async function addUserCountryColumn(connection) {
  if (!(await columnExists(connection, 'users', 'country'))) {
    await connection.query('ALTER TABLE users ADD COLUMN country VARCHAR(100) NULL');
    console.log('Added users.country');
  } else {
    console.log('users.country already exists — skip');
  }
}

async function printFinalSchema(connection) {
  console.log('\n=== Final schema verification ===\n');

  for (const table of ['mm_proposals', 'mm_matches']) {
    const [cols] = await connection.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [table]
    );
    console.log(`-- ${table}`);
    cols.forEach((c) => {
      console.log(`   ${c.COLUMN_NAME} ${c.COLUMN_TYPE} ${c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'} ${c.COLUMN_KEY || ''}`);
    });
    console.log('');
  }

  const [[roleCol]] = await connection.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
  );
  console.log(`-- users.role: ${roleCol.COLUMN_TYPE}`);

  const hasCountry = await columnExists(connection, 'users', 'country');
  console.log(`-- users.country: ${hasCountry ? 'present' : 'MISSING'}`);

  const legacyGone = await tableExists(connection, 'mm_pakistan_proposals');
  console.log(`-- mm_pakistan_proposals: ${legacyGone ? 'STILL EXISTS (unexpected)' : 'removed'}`);
  console.log(`-- mm_china_proposals: ${(await tableExists(connection, 'mm_china_proposals')) ? 'STILL EXISTS' : 'removed'}`);
  console.log('\n=== Migration complete ===\n');
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  console.log(`Database: ${database}`);
  await printPreDropSummary(connection);

  await dropLegacyMatchmakingTables(connection);
  await createMultiCountryTables(connection);
  await migrateUserRoles(connection);
  await addUserCountryColumn(connection);
  await printFinalSchema(connection);

  await connection.end();
}

migrate().catch((err) => {
  console.error('Multi-country matchmaking migration failed:', err.message);
  process.exit(1);
});

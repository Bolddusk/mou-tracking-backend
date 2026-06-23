require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function dropNewTables(connection) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['mm_matches', 'mm_proposals']) {
    if (await tableExists(connection, table)) {
      await connection.query(`DROP TABLE \`${table}\``);
      console.log(`Dropped ${table}`);
    }
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function recreateLegacyTables(connection) {
  if (!(await tableExists(connection, 'mm_pakistan_proposals'))) {
    await connection.query(`
      CREATE TABLE mm_pakistan_proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        party_a_id INT NOT NULL,
        sector VARCHAR(100) NOT NULL DEFAULT '',
        proposal_title VARCHAR(255) NOT NULL DEFAULT '',
        proposal_description TEXT,
        proposal_file_url VARCHAR(500),
        engagement_type ENUM('G2G','B2B','B2G','G2B') NULL,
        conference_info JSON NULL,
        party_a_info JSON NULL,
        company_name VARCHAR(255) NULL,
        company_logo_url VARCHAR(500) NULL,
        cover_image_url VARCHAR(500) NULL,
        project_type ENUM('Greenfield','Brownfield') NULL,
        venture_name VARCHAR(255) NULL,
        executive_summary JSON NULL,
        company_overview JSON NULL,
        project_overview JSON NULL,
        financials JSON NULL,
        investment_ask JSON NULL,
        contact_info JSON NULL,
        status ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
        submitted_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (party_a_id) REFERENCES users(id)
      )
    `);
    console.log('Recreated mm_pakistan_proposals (baseline)');
  }

  if (!(await tableExists(connection, 'mm_china_proposals'))) {
    await connection.query(`
      CREATE TABLE mm_china_proposals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uploaded_by_rfp INT NOT NULL,
        sector VARCHAR(100) NOT NULL DEFAULT '',
        proposal_title VARCHAR(255) NOT NULL DEFAULT '',
        proposal_description TEXT,
        proposal_file_url VARCHAR(500),
        engagement_type ENUM('G2G','B2B','B2G','G2B') NULL,
        conference_info JSON NULL,
        party_b_entity_type ENUM('government','business') NULL,
        party_b_name VARCHAR(100) NULL,
        party_b_organization VARCHAR(100) NULL,
        party_b_email VARCHAR(150) NULL,
        party_b_phone VARCHAR(20) NULL,
        party_b_country VARCHAR(100) NULL,
        company_name VARCHAR(255) NULL,
        company_logo_url VARCHAR(500) NULL,
        cover_image_url VARCHAR(500) NULL,
        project_type ENUM('Greenfield','Brownfield') NULL,
        venture_name VARCHAR(255) NULL,
        executive_summary JSON NULL,
        company_overview JSON NULL,
        project_overview JSON NULL,
        financials JSON NULL,
        investment_ask JSON NULL,
        contact_info JSON NULL,
        status ENUM('active','archived') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (uploaded_by_rfp) REFERENCES users(id)
      )
    `);
    console.log('Recreated mm_china_proposals (baseline)');
  }

  if (!(await tableExists(connection, 'mm_matches'))) {
    await connection.query(`
      CREATE TABLE mm_matches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pk_proposal_id INT NOT NULL,
        china_proposal_id INT NOT NULL,
        status ENUM('created','pending_sl_review','approved','rejected') NOT NULL DEFAULT 'created',
        proposed_by_rfp INT NOT NULL,
        proposed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        submitted_for_review_at TIMESTAMP NULL,
        sl_reviewed_by INT NULL,
        sl_reviewed_at TIMESTAMP NULL,
        sl_comment TEXT,
        engagement_proposal_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_mm_pk_china (pk_proposal_id, china_proposal_id),
        FOREIGN KEY (pk_proposal_id) REFERENCES mm_pakistan_proposals(id),
        FOREIGN KEY (china_proposal_id) REFERENCES mm_china_proposals(id),
        FOREIGN KEY (proposed_by_rfp) REFERENCES users(id),
        FOREIGN KEY (sl_reviewed_by) REFERENCES users(id),
        FOREIGN KEY (engagement_proposal_id) REFERENCES proposals(id)
      )
    `);
    console.log('Recreated mm_matches (baseline)');
  }
}

async function revertUserRoles(connection) {
  await connection.query("UPDATE users SET role = 'chinese_investor' WHERE role = 'investor'");
  await connection.query(
    "UPDATE users SET role = 'regional_focal_point' WHERE role = 'focal_point'"
  );

  await connection.query(`
    ALTER TABLE users
    MODIFY COLUMN role ENUM(
      'super_admin','admin','sector_lead','regional_focal_point',
      'party_a','party_b','chinese_investor'
    ) NOT NULL
  `);
  console.log('Reverted users.role ENUM (restored chinese_investor)');
}

async function rollback() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  console.log('Rolling back multi-country matchmaking schema...');
  console.log('NOTE: Re-run legacy migrations (matchmaking-*) to restore extended columns on old tables.\n');

  await dropNewTables(connection);
  await recreateLegacyTables(connection);
  await revertUserRoles(connection);

  await connection.end();
  console.log('Multi-country rollback complete.');
}

rollback().catch((err) => {
  console.error('Rollback failed:', err.message);
  process.exit(1);
});

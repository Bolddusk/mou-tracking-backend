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

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await tableExists(connection, 'ministries'))) {
    await connection.query(`
      CREATE TABLE ministries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Created ministries table');
  }

  const [existingMnfsr] = await connection.query(
    `SELECT id FROM ministries WHERE code = 'mnfsr' LIMIT 1`
  );
  let mnfsrId = existingMnfsr[0]?.id;
  if (!mnfsrId) {
    const [ins] = await connection.query(
      `INSERT INTO ministries (code, name, is_active)
       VALUES ('mnfsr', 'Ministry of National Food Security & Research', 1)`
    );
    mnfsrId = ins.insertId;
    console.log('Seeded ministry MNFSR id=', mnfsrId);
  } else {
    console.log('MNFSR already exists id=', mnfsrId);
  }

  await connection.query(`
    ALTER TABLE users
    MODIFY COLUMN role ENUM(
      'super_admin','admin','power_admin','sector_lead','regional_focal_point',
      'party_a','party_b','investor','focal_point'
    ) NOT NULL
  `);
  console.log('Updated users.role ENUM (+ power_admin)');

  // Allow Power Admin (and common roles) on activity comments
  try {
    await connection.query(`
      ALTER TABLE activity_comments
      MODIFY COLUMN commented_by_role ENUM(
        'party_a','party_b','investor','sector_lead','super_admin','admin','power_admin',
        'regional_focal_point','focal_point'
      ) NOT NULL
    `);
    console.log('Widened activity_comments.commented_by_role');
  } catch (err) {
    console.warn('activity_comments role enum:', err.message);
  }

  try {
    await connection.query(`
      ALTER TABLE proposal_activities
      MODIFY COLUMN added_by_role ENUM(
        'party_a','party_b','investor','sector_lead','super_admin','admin','power_admin',
        'regional_focal_point','focal_point'
      ) NOT NULL
    `);
    console.log('Widened proposal_activities.added_by_role (+ power_admin)');
  } catch (err) {
    console.warn('proposal_activities.added_by_role enum:', err.message);
  }

  try {
    await connection.query(`
      ALTER TABLE activity_approvals
      MODIFY COLUMN action_by_role ENUM(
        'sector_lead','super_admin','admin','power_admin','regional_focal_point'
      ) NOT NULL
    `);
    console.log('Widened activity_approvals.action_by_role (+ power_admin)');
  } catch (err) {
    console.warn('activity_approvals.action_by_role enum:', err.message);
  }

  try {
    await connection.query(`
      ALTER TABLE proposal_chat_messages
      MODIFY COLUMN sender_role ENUM(
        'party_a','party_b','investor','sector_lead','super_admin','admin','power_admin'
      ) NOT NULL
    `);
    console.log('Widened proposal_chat_messages.sender_role (+ power_admin)');
  } catch (err) {
    console.warn('proposal_chat_messages role enum:', err.message);
  }

  if (!(await columnExists(connection, 'users', 'ministry_id'))) {
    await connection.query(`
      ALTER TABLE users
      ADD COLUMN ministry_id INT NULL AFTER role,
      ADD INDEX idx_users_ministry (ministry_id),
      ADD CONSTRAINT fk_users_ministry
        FOREIGN KEY (ministry_id) REFERENCES ministries(id)
    `);
    console.log('Added users.ministry_id');
  }

  if (!(await columnExists(connection, 'proposals', 'ministry_id'))) {
    await connection.query(`
      ALTER TABLE proposals
      ADD COLUMN ministry_id INT NULL AFTER id,
      ADD INDEX idx_proposals_ministry (ministry_id)
    `);
    console.log('Added proposals.ministry_id (nullable for backfill)');
  }

  if (!(await columnExists(connection, 'conferences', 'ministry_id'))) {
    await connection.query(`
      ALTER TABLE conferences
      ADD COLUMN ministry_id INT NULL AFTER id,
      ADD INDEX idx_conferences_ministry (ministry_id)
    `);
    console.log('Added conferences.ministry_id (nullable for backfill)');
  }

  await connection.query(
    `UPDATE users
     SET ministry_id = ?
     WHERE ministry_id IS NULL
       AND role NOT IN ('super_admin', 'power_admin')`,
    [mnfsrId]
  );
  console.log('Backfilled users.ministry_id → MNFSR (non-global roles)');

  await connection.query(
    `UPDATE users SET ministry_id = NULL WHERE role IN ('super_admin', 'power_admin')`
  );

  await connection.query(`UPDATE proposals SET ministry_id = ? WHERE ministry_id IS NULL`, [
    mnfsrId,
  ]);
  console.log('Backfilled proposals.ministry_id → MNFSR');

  await connection.query(`UPDATE conferences SET ministry_id = ? WHERE ministry_id IS NULL`, [
    mnfsrId,
  ]);
  console.log('Backfilled conferences.ministry_id → MNFSR');

  // Enforce NOT NULL on proposals/conferences after backfill
  try {
    const [fkP] = await connection.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposals'
         AND CONSTRAINT_NAME = 'fk_proposals_ministry'`
    );
    if (!fkP.length) {
      await connection.query(`
        ALTER TABLE proposals
        MODIFY COLUMN ministry_id INT NOT NULL,
        ADD CONSTRAINT fk_proposals_ministry
          FOREIGN KEY (ministry_id) REFERENCES ministries(id)
      `);
      console.log('Enforced proposals.ministry_id NOT NULL + FK');
    }
  } catch (err) {
    console.warn('proposals ministry FK:', err.message);
  }

  try {
    const [fkC] = await connection.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conferences'
         AND CONSTRAINT_NAME = 'fk_conferences_ministry'`
    );
    if (!fkC.length) {
      await connection.query(`
        ALTER TABLE conferences
        MODIFY COLUMN ministry_id INT NOT NULL,
        ADD CONSTRAINT fk_conferences_ministry
          FOREIGN KEY (ministry_id) REFERENCES ministries(id)
      `);
      console.log('Enforced conferences.ministry_id NOT NULL + FK');
    }
  } catch (err) {
    console.warn('conferences ministry FK:', err.message);
  }

  await connection.end();
  console.log('Ministry multi-tenancy migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

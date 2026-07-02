require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');
const {
  PERMISSION_CATALOG,
  ROLE_PERMISSIONS,
  ALL_PERMISSION_KEYS,
} = require('../utils/rolePermissions');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

function expandRolePermissions(role, keys) {
  if (keys.includes('*')) return [...ALL_PERMISSION_KEYS];
  return [...keys];
}

async function seedIfEmpty(connection) {
  const [[{ count }]] = await connection.query(
    'SELECT COUNT(*) AS count FROM role_permission_grants'
  );
  if (count > 0) {
    console.log('role_permission_grants already seeded — skipping.');
    return;
  }

  for (const entry of PERMISSION_CATALOG) {
    await connection.query(
      `INSERT INTO permission_definitions (permission_key, group_key, label)
       VALUES (?, ?, ?)`,
      [entry.key, entry.group, entry.label]
    );
  }
  console.log(`Seeded ${PERMISSION_CATALOG.length} permission definitions.`);

  for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const expanded = expandRolePermissions(role, keys);
    for (const permissionKey of expanded) {
      await connection.query(
        `INSERT INTO role_permission_grants (role, permission_key) VALUES (?, ?)`,
        [role, permissionKey]
      );
    }
    console.log(`Seeded ${expanded.length} permissions for role: ${role}`);
  }
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await tableExists(connection, 'permission_definitions'))) {
    await connection.query(`
      CREATE TABLE permission_definitions (
        permission_key VARCHAR(80) PRIMARY KEY,
        group_key VARCHAR(40) NOT NULL,
        label VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Created permission_definitions');
  }

  if (!(await tableExists(connection, 'role_permission_grants'))) {
    await connection.query(`
      CREATE TABLE role_permission_grants (
        role VARCHAR(50) NOT NULL,
        permission_key VARCHAR(80) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (role, permission_key),
        FOREIGN KEY (permission_key) REFERENCES permission_definitions(permission_key) ON DELETE CASCADE
      )
    `);
    console.log('Created role_permission_grants');
  }

  await seedIfEmpty(connection);

  await connection.end();
  console.log('Role permissions migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

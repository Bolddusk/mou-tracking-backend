require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');
const {
  PERMISSION_CATALOG,
  ROLE_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  PERMISSION_ALIASES,
  OBSOLETE_NAV_KEYS,
} = require('../utils/rolePermissions');

const LEGACY_GRANT_MIGRATIONS = Object.entries(PERMISSION_ALIASES).map(([legacy, canonical]) => ({
  legacy,
  canonical,
}));

function expandRolePermissions(role, keys) {
  if (keys.includes('*')) return [...ALL_PERMISSION_KEYS];
  return [...keys];
}

async function syncFromCode(connection) {
  for (const entry of PERMISSION_CATALOG) {
    await connection.query(
      `INSERT INTO permission_definitions (permission_key, group_key, label)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE group_key = VALUES(group_key), label = VALUES(label)`,
      [entry.key, entry.group, entry.label]
    );
  }
  console.log(`Synced ${PERMISSION_CATALOG.length} permission definitions.`);

  let grantsAdded = 0;
  for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const expanded = expandRolePermissions(role, keys);
    for (const permissionKey of expanded) {
      const [result] = await connection.query(
        `INSERT IGNORE INTO role_permission_grants (role, permission_key) VALUES (?, ?)`,
        [role, permissionKey]
      );
      grantsAdded += result.affectedRows;
    }
  }
  console.log(`Added ${grantsAdded} missing role_permission_grants from code defaults.`);

  let migrated = 0;
  for (const { legacy, canonical } of LEGACY_GRANT_MIGRATIONS) {
    const [result] = await connection.query(
      `INSERT IGNORE INTO role_permission_grants (role, permission_key)
       SELECT role, ? FROM role_permission_grants WHERE permission_key = ?`,
      [canonical, legacy]
    );
    migrated += result.affectedRows;
  }
  if (migrated > 0) {
    console.log(`Migrated ${migrated} legacy permission grants to canonical keys.`);
  }

  const actionMigrations = [
    ['proposals.view_detail', 'proposals.view'],
    ['proposals.view_own', 'proposals.view'],
  ];
  let actionMigrated = 0;
  for (const [legacy, canonical] of actionMigrations) {
    const [result] = await connection.query(
      `INSERT IGNORE INTO role_permission_grants (role, permission_key)
       SELECT role, ? FROM role_permission_grants WHERE permission_key = ?`,
      [canonical, legacy]
    );
    actionMigrated += result.affectedRows;
  }
  if (actionMigrated > 0) {
    console.log(`Migrated ${actionMigrated} legacy action grants (proposals.view).`);
  }

  if (OBSOLETE_NAV_KEYS.length) {
    const placeholders = OBSOLETE_NAV_KEYS.map(() => '?').join(',');
    const [removed] = await connection.query(
      `DELETE FROM role_permission_grants WHERE permission_key IN (${placeholders})`,
      OBSOLETE_NAV_KEYS
    );
    if (removed.affectedRows > 0) {
      console.log(`Removed ${removed.affectedRows} obsolete nav permission grants.`);
    }
  }

  const scopeFixes = [
    { role: 'sector_lead', wrong: 'proposals.list_all', correct: 'proposals.list_sector' },
    { role: 'sector_lead', wrong: 'proposals.list_own', correct: 'proposals.list_sector' },
    { role: 'party_a', wrong: 'proposals.list_all', correct: 'proposals.list_own' },
    { role: 'party_a', wrong: 'proposals.list_sector', correct: 'proposals.list_own' },
    { role: 'party_b', wrong: 'proposals.list_all', correct: 'proposals.list_own' },
    { role: 'party_b', wrong: 'proposals.list_sector', correct: 'proposals.list_own' },
  ];
  let scopeFixed = 0;
  for (const { role, wrong, correct } of scopeFixes) {
    const [deleted] = await connection.query(
      `DELETE FROM role_permission_grants WHERE role = ? AND permission_key = ?`,
      [role, wrong]
    );
    scopeFixed += deleted.affectedRows;
    const [added] = await connection.query(
      `INSERT IGNORE INTO role_permission_grants (role, permission_key)
       SELECT ?, ? FROM role_permission_grants
       WHERE role = ? AND permission_key = 'nav.opportunities.all'`,
      [role, correct, role]
    );
    scopeFixed += added.affectedRows;
  }
  if (scopeFixed > 0) {
    console.log(`Fixed ${scopeFixed} opportunities list-scope grants (role-aware).`);
  }
}

async function main() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  const [[{ count }]] = await connection.query(
    'SELECT COUNT(*) AS count FROM permission_definitions'
  );
  if (count === 0) {
    console.error('permission_definitions is empty — run npm run db:migrate:role-permissions first.');
    process.exit(1);
  }

  await syncFromCode(connection);
  await connection.end();
  console.log('Role permissions sync complete.');
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});

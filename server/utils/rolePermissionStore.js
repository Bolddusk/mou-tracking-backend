const pool = require('../config/db');
const {
  PERMISSION_CATALOG,
  ROLE_PERMISSIONS,
  ALL_PERMISSION_KEYS,
  OBSOLETE_NAV_KEYS,
  PERMISSION_ALIASES,
} = require('./rolePermissions');
const { expandNavGrantsWithMinimumBundles, sanitizeRoleListPermissions } = require('./permissionBundles');
const { isValidRole } = require('./userHelpers');

let grantsCache = null;

function expandStaticRolePermissions(role) {
  const keys = ROLE_PERMISSIONS[role];
  if (!keys) return [];
  if (keys.includes('*')) return [...ALL_PERMISSION_KEYS];
  return [...keys];
}

function buildCacheFromRows(rows) {
  const map = {};
  rows.forEach((row) => {
    if (!map[row.role]) map[row.role] = new Set();
    map[row.role].add(row.permission_key);
  });
  return map;
}

async function refreshGrantsCache() {
  const [rows] = await pool.query(
    'SELECT role, permission_key FROM role_permission_grants ORDER BY role, permission_key'
  );
  grantsCache = buildCacheFromRows(rows);
  return grantsCache;
}

async function getGrantsCache() {
  if (!grantsCache) {
    await refreshGrantsCache();
  }
  return grantsCache;
}

async function getStoredPermissionsForRole(role) {
  const cache = await getGrantsCache();
  const set = cache[role];
  if (set && set.size > 0) {
    return [...set].sort();
  }
  return expandStaticRolePermissions(role);
}

async function getAllRolesWithPermissions() {
  const cache = await getGrantsCache();
  const roles = new Set([...Object.keys(ROLE_PERMISSIONS), ...Object.keys(cache)]);

  const result = {};
  for (const role of roles) {
    result[role] = await getStoredPermissionsForRole(role);
  }
  return result;
}

async function getPermissionCatalogFromDb() {
  const [rows] = await pool.query(
    'SELECT permission_key, group_key, label FROM permission_definitions ORDER BY group_key, permission_key'
  );

  const byKey = new Map();
  rows.forEach((row) => {
    byKey.set(row.permission_key, {
      key: row.permission_key,
      group: row.group_key,
      label: row.label,
    });
  });

  PERMISSION_CATALOG.forEach((entry) => {
    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, { ...entry });
    }
  });

  OBSOLETE_NAV_KEYS.forEach((key) => byKey.delete(key));

  return [...byKey.values()].sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return a.key.localeCompare(b.key);
  });
}

function splitObsoleteAndMapKeys(keys) {
  const valid = [];
  const obsolete = [];
  (Array.isArray(keys) ? keys : []).forEach((key) => {
    if (OBSOLETE_NAV_KEYS.includes(key)) {
      obsolete.push(key);
      return;
    }
    const mapped = PERMISSION_ALIASES[key] || key;
    valid.push(mapped);
  });
  return {
    valid: [...new Set(valid)],
    obsolete: [...new Set(obsolete)],
  };
}

function validatePermissionKeys(keys) {
  const allowed = new Set(PERMISSION_CATALOG.map((p) => p.key));
  const obsolete = new Set(OBSOLETE_NAV_KEYS);
  const invalid = keys.filter((key) => !allowed.has(key) || obsolete.has(key));
  if (invalid.length) {
    return { error: `Invalid or obsolete permission keys: ${invalid.join(', ')}` };
  }
  return { ok: true, keys: [...new Set(keys)] };
}

function sanitizePermissionKeysForReplace(permissionKeys) {
  const { valid, obsolete } = splitObsoleteAndMapKeys(permissionKeys);
  const validation = validatePermissionKeys(valid);
  if (validation.error) {
    return { ...validation, ignored_obsolete: obsolete };
  }
  return { ok: true, keys: validation.keys, ignored_obsolete: obsolete };
}

async function replaceRolePermissions(role, permissionKeys) {
  if (!isValidRole(role)) {
    return { error: 'Invalid role', status: 400 };
  }

  const validation = sanitizePermissionKeysForReplace(permissionKeys);
  if (validation.error) {
    return { error: validation.error, status: 400 };
  }

  const sanitizedKeys = sanitizeRoleListPermissions(role, validation.keys);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM role_permission_grants WHERE role = ?', [role]);
    for (const permissionKey of sanitizedKeys) {
      await connection.query(
        'INSERT INTO role_permission_grants (role, permission_key) VALUES (?, ?)',
        [role, permissionKey]
      );
    }
    await connection.commit();
    await refreshGrantsCache();
    return {
      ok: true,
      permissions: sanitizedKeys,
      ignored_obsolete: validation.ignored_obsolete,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function patchRolePermissions(role, { grant = [], revoke = [] }) {
  if (!isValidRole(role)) {
    return { error: 'Invalid role', status: 400 };
  }

  const grantSplit = splitObsoleteAndMapKeys(grant);
  const revokeSplit = splitObsoleteAndMapKeys(revoke);
  const ignored_obsolete = [...new Set([...grantSplit.obsolete, ...revokeSplit.obsolete])];

  const expandedGrant = expandNavGrantsWithMinimumBundles(grantSplit.valid, role);
  const revokeValid = revokeSplit.valid;

  if (!expandedGrant.length && !revokeValid.length && !ignored_obsolete.length) {
    return { error: 'grant or revoke array required', status: 400 };
  }

  if (expandedGrant.length || revokeValid.length) {
    const validation = validatePermissionKeys([...expandedGrant, ...revokeValid]);
    if (validation.error) {
      return { error: validation.error, status: 400 };
    }
  }

  const current = new Set(await getStoredPermissionsForRole(role));
  expandedGrant.forEach((key) => current.add(key));
  revokeValid.forEach((key) => current.delete(key));
  ignored_obsolete.forEach((key) => current.delete(key));

  const sanitized = sanitizeRoleListPermissions(role, [...current]);
  const result = await replaceRolePermissions(role, sanitized);
  if (result.ok) {
    result.ignored_obsolete = ignored_obsolete;
  }
  return result;
}

module.exports = {
  refreshGrantsCache,
  getStoredPermissionsForRole,
  getAllRolesWithPermissions,
  getPermissionCatalogFromDb,
  replaceRolePermissions,
  patchRolePermissions,
};

const { VALID_ROLES, ROLE_LABELS, isValidRole } = require('../utils/userHelpers');
const {
  PERMISSION_CATALOG,
  buildNavigationForRole,
  buildGroupedPermissionCatalog,
  normalizeClientPermissions,
} = require('../utils/rolePermissions');
const {
  NAV_PERMISSION_BUNDLES,
  resolveBundleGrantKeys,
} = require('../utils/permissionBundles');
const {
  getPermissionCatalogFromDb,
  getAllRolesWithPermissions,
  getStoredPermissionsForRole,
  replaceRolePermissions,
  patchRolePermissions,
} = require('../utils/rolePermissionStore');

async function listPermissionBundles(req, res) {
  try {
    return res.json({
      bundles: NAV_PERMISSION_BUNDLES,
      sidebar_nav_count: NAV_PERMISSION_BUNDLES.length,
    });
  } catch (err) {
    console.error('List permission bundles error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch permission bundles' });
  }
}

async function grantPermissionBundle(req, res) {
  try {
    const role = String(req.params.role || '').trim();
    const { nav_key: navKey, level = 'minimum', permissions: customPermissions } = req.body;

    if (!isValidRole(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    if (!navKey) {
      return res.status(400).json({ error: 'nav_key is required' });
    }

    const resolved = resolveBundleGrantKeys(navKey, level, customPermissions);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }

    const result = await patchRolePermissions(role, { grant: resolved.grant });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    const permissions = normalizeClientPermissions(result.permissions);

    return res.json({
      message: 'Permission bundle granted',
      role,
      label: ROLE_LABELS[role] || role,
      nav_key: navKey,
      level,
      granted: resolved.grant,
      bundle: resolved.bundle,
      permissions,
      navigation: buildNavigationForRole(role, result.permissions),
    });
  } catch (err) {
    console.error('Grant permission bundle error:', err.message);
    return res.status(500).json({ error: 'Failed to grant permission bundle' });
  }
}

async function listPermissionCatalog(req, res) {
  try {
    const rawCatalog = await getPermissionCatalogFromDb();
    const catalog = rawCatalog.length ? rawCatalog : PERMISSION_CATALOG;
    const { catalog: permissions, groups } = buildGroupedPermissionCatalog(catalog);

    return res.json({
      permissions,
      groups,
    });
  } catch (err) {
    console.error('List permission catalog error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch permission catalog' });
  }
}

async function listRolesWithPermissions(req, res) {
  try {
    const map = await getAllRolesWithPermissions();
    const roles = VALID_ROLES.map((role) => {
      const permissions = map[role] || [];
      return {
        value: role,
        label: ROLE_LABELS[role] || role,
        permissions,
        permission_count: permissions.length,
        navigation: buildNavigationForRole(role, permissions),
      };
    });

    return res.json({ roles });
  } catch (err) {
    console.error('List roles with permissions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch role permissions' });
  }
}

async function getRolePermissions(req, res) {
  try {
    const role = String(req.params.role || '').trim();
    if (!isValidRole(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const permissions = await getStoredPermissionsForRole(role);
    const rawCatalog = await getPermissionCatalogFromDb();
    const { catalog, groups } = buildGroupedPermissionCatalog(
      rawCatalog.length ? rawCatalog : PERMISSION_CATALOG
    );

    return res.json({
      role,
      label: ROLE_LABELS[role] || role,
      permissions,
      navigation: buildNavigationForRole(role, permissions),
      catalog,
      groups,
    });
  } catch (err) {
    console.error('Get role permissions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch role permissions' });
  }
}

async function updateRolePermissions(req, res) {
  try {
    const role = String(req.params.role || '').trim();
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions must be an array of permission keys' });
    }

    const result = await replaceRolePermissions(role, permissions);
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json({
      message: 'Role permissions updated',
      role,
      label: ROLE_LABELS[role] || role,
      permissions: result.permissions,
      navigation: buildNavigationForRole(role, result.permissions),
    });
  } catch (err) {
    console.error('Update role permissions error:', err.message);
    return res.status(500).json({ error: 'Failed to update role permissions' });
  }
}

async function patchRolePermissionsHandler(req, res) {
  try {
    const role = String(req.params.role || '').trim();
    const { grant, revoke } = req.body;

    const result = await patchRolePermissions(role, { grant, revoke });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json({
      message: 'Role permissions patched',
      role,
      label: ROLE_LABELS[role] || role,
      permissions: normalizeClientPermissions(result.permissions),
      navigation: buildNavigationForRole(role, result.permissions),
      granted: grant || [],
      revoked: revoke || [],
      ignored_obsolete: result.ignored_obsolete || [],
    });
  } catch (err) {
    console.error('Patch role permissions error:', err.message);
    return res.status(500).json({ error: 'Failed to patch role permissions' });
  }
}

module.exports = {
  listPermissionCatalog,
  listPermissionBundles,
  listRolesWithPermissions,
  getRolePermissions,
  updateRolePermissions,
  patchRolePermissionsHandler,
  grantPermissionBundle,
};

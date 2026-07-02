const { hasAnyPermission, loadUserPermissions } = require('../utils/rolePermissions');

function requireAnyPermission(...permissions) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const userPermissions = await loadUserPermissions(req.user);
      req.userPermissions = userPermissions;

      if (await hasAnyPermission(req.user, permissions, userPermissions)) {
        return next();
      }

      return res.status(403).json({ error: 'Access denied' });
    } catch (err) {
      console.error('requireAnyPermission error:', err.message);
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

function requirePermission(permission) {
  return requireAnyPermission(permission);
}

module.exports = { requirePermission, requireAnyPermission };

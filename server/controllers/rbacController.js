const { buildRbacPayload, buildRbacCatalog } = require('../utils/rolePermissions');

async function getMyPermissions(req, res) {
  try {
    const rbac = await buildRbacPayload(req.user);
    return res.json({
      redirect: rbac.redirect,
      rbac,
    });
  } catch (err) {
    console.error('Get permissions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch permissions' });
  }
}

async function getRbacCatalog(req, res) {
  try {
    return res.json(await buildRbacCatalog());
  } catch (err) {
    console.error('Get RBAC catalog error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch role permissions catalog' });
  }
}

module.exports = {
  getMyPermissions,
  getRbacCatalog,
};

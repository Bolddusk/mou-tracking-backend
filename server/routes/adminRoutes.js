const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/requirePermission');
const { complianceDocumentUpload, handleUploadError } = require('../middleware/upload');
const {
  reassignSectorLead,
  getReassignments,
  getOrphans,
} = require('../controllers/adminSectorLeadController');
const {
  getMeta,
  listFilings,
  getOverview,
  getUserMatrix,
  uploadFiling,
  deleteFiling,
} = require('../controllers/complianceFilingsController');
const {
  adminListSectors,
  adminGetSector,
  adminCreateSector,
  adminUpdateSector,
  adminDeleteSector,
} = require('../controllers/sectorController');
const {
  listPermissionCatalog,
  listRolesWithPermissions,
  getRolePermissions,
  updateRolePermissions,
  patchRolePermissionsHandler,
  listPermissionBundles,
  grantPermissionBundle,
} = require('../controllers/adminRbacController');

const router = express.Router();

const superAdmin = [verifyToken, requireRole('super_admin')];
const adminRoles = [verifyToken, requireAnyPermission('nav.sectors.manage', 'admin.sectors')];
const rbacAdmin = [verifyToken, requireAnyPermission('nav.permissions.manage', 'admin.rbac')];
const slReassign = [verifyToken, requireAnyPermission('nav.sector_lead.reassign', 'admin.sl_reassign')];
const complianceAdmin = [verifyToken, requireAnyPermission('nav.compliance.audit', 'admin.compliance')];

router.patch('/sector-lead/reassign', ...slReassign, reassignSectorLead);
router.get('/sector-lead/reassignments', ...slReassign, getReassignments);
router.get('/sector-lead/orphans', ...slReassign, getOrphans);

router.get('/compliance-filings/meta', ...complianceAdmin, getMeta);
router.get('/compliance-filings/overview', ...complianceAdmin, getOverview);
router.get('/compliance-filings', ...complianceAdmin, listFilings);
router.get('/compliance-filings/users/:userId/matrix', ...complianceAdmin, getUserMatrix);
router.post(
  '/compliance-filings',
  ...complianceAdmin,
  complianceDocumentUpload,
  handleUploadError,
  uploadFiling
);
router.delete('/compliance-filings/:id', ...complianceAdmin, deleteFiling);

router.get('/rbac/permission-bundles', ...rbacAdmin, listPermissionBundles);
router.get('/rbac/permissions', ...rbacAdmin, listPermissionCatalog);
router.get('/rbac/roles', ...rbacAdmin, listRolesWithPermissions);
router.get('/rbac/roles/:role', ...rbacAdmin, getRolePermissions);
router.put('/rbac/roles/:role', ...rbacAdmin, updateRolePermissions);
router.patch('/rbac/roles/:role', ...rbacAdmin, patchRolePermissionsHandler);
router.post('/rbac/roles/:role/grant-bundle', ...rbacAdmin, grantPermissionBundle);

router.get('/sectors', ...adminRoles, adminListSectors);
router.get('/sectors/:id', ...adminRoles, adminGetSector);
router.post('/sectors', ...adminRoles, adminCreateSector);
router.patch('/sectors/:id', ...adminRoles, adminUpdateSector);
router.delete('/sectors/:id', ...adminRoles, adminDeleteSector);

module.exports = router;

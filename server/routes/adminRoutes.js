const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
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

const router = express.Router();

const superAdmin = [verifyToken, requireRole('super_admin')];
const adminRoles = [verifyToken, requireRole('super_admin', 'admin')];

router.patch('/sector-lead/reassign', ...superAdmin, reassignSectorLead);
router.get('/sector-lead/reassignments', ...superAdmin, getReassignments);
router.get('/sector-lead/orphans', ...superAdmin, getOrphans);

router.get('/compliance-filings/meta', ...superAdmin, getMeta);
router.get('/compliance-filings/overview', ...superAdmin, getOverview);
router.get('/compliance-filings', ...superAdmin, listFilings);
router.get('/compliance-filings/users/:userId/matrix', ...superAdmin, getUserMatrix);
router.post(
  '/compliance-filings',
  ...superAdmin,
  complianceDocumentUpload,
  handleUploadError,
  uploadFiling
);
router.delete('/compliance-filings/:id', ...superAdmin, deleteFiling);

router.get('/sectors', ...adminRoles, adminListSectors);
router.get('/sectors/:id', ...adminRoles, adminGetSector);
router.post('/sectors', ...adminRoles, adminCreateSector);
router.patch('/sectors/:id', ...adminRoles, adminUpdateSector);
router.delete('/sectors/:id', ...adminRoles, adminDeleteSector);

module.exports = router;

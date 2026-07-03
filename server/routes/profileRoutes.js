const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { profileDocumentUpload, complianceDocumentUpload, handleUploadError } = require('../middleware/upload');
const {
  getProfile,
  getProfileByUserId,
  listPartyAProfiles,
  getSectors,
  updateProfile,
  updateProfileByUserId,
  uploadDocument,
  uploadDocumentByUserId,
  deleteDocument,
  deleteDocumentByUserId,
} = require('../controllers/partyAProfileController');
const {
  getProfileByUserId: getPartyBProfileByUserId,
  getPartyBProfileEntry,
  updateProfile: updatePartyBProfile,
  updateProfileByUserId: updatePartyBProfileByUserId,
  uploadDocument: uploadPartyBDocument,
  uploadDocumentByUserId: uploadPartyBDocumentByUserId,
  deleteDocument: deletePartyBDocument,
  deleteDocumentByUserId: deletePartyBDocumentByUserId,
} = require('../controllers/partyBProfileController');
const {
  getMyMeta,
  getMyMatrix,
  uploadMyFiling,
  deleteMyFiling,
} = require('../controllers/complianceFilingsController');

const router = express.Router();

const partyAOnly = [verifyToken, requireRole('party_a')];
const partyBOnly = [verifyToken, requireRole('party_b', 'investor')];
const profileViewers = [
  verifyToken,
  requireRole('party_a', 'sector_lead', 'super_admin', 'admin', 'focal_point', 'regional_focal_point'),
];
const partyBProfileViewers = [
  verifyToken,
  requireRole(
    'party_b',
    'investor',
    'sector_lead',
    'super_admin',
    'admin',
    'focal_point',
    'regional_focal_point'
  ),
];
const profileStaffEditors = [
  verifyToken,
  requireRole('sector_lead', 'super_admin', 'admin', 'focal_point', 'regional_focal_point'),
];
const profileListRoles = [verifyToken, requireRole('sector_lead', 'super_admin', 'admin')];

router.get('/sectors', verifyToken, getSectors);
router.get('/party-a', ...profileListRoles, listPartyAProfiles);
router.patch('/party-a/:userId', ...profileStaffEditors, updateProfileByUserId);
router.post(
  '/party-a/:userId/documents',
  ...profileStaffEditors,
  profileDocumentUpload,
  handleUploadError,
  uploadDocumentByUserId
);
router.delete('/party-a/:userId/documents/:docId', ...profileStaffEditors, deleteDocumentByUserId);

router.get('/party-b', ...partyBProfileViewers, getPartyBProfileEntry);
router.get('/party-b/:userId', ...partyBProfileViewers, getPartyBProfileByUserId);
router.patch('/party-b', ...partyBOnly, updatePartyBProfile);
router.patch('/party-b/:userId', ...profileStaffEditors, updatePartyBProfileByUserId);
router.post(
  '/party-b/documents',
  ...partyBOnly,
  profileDocumentUpload,
  handleUploadError,
  uploadPartyBDocument
);
router.post(
  '/party-b/:userId/documents',
  ...profileStaffEditors,
  profileDocumentUpload,
  handleUploadError,
  uploadPartyBDocumentByUserId
);
router.delete('/party-b/documents/:id', ...partyBOnly, deletePartyBDocument);
router.delete(
  '/party-b/:userId/documents/:docId',
  ...profileStaffEditors,
  deletePartyBDocumentByUserId
);

router.get('/compliance-filings/meta', ...partyAOnly, getMyMeta);
router.get('/compliance-filings/matrix', ...partyAOnly, getMyMatrix);
router.post(
  '/compliance-filings',
  ...partyAOnly,
  complianceDocumentUpload,
  handleUploadError,
  uploadMyFiling
);
router.delete('/compliance-filings/:id', ...partyAOnly, deleteMyFiling);

router.get('/:userId', ...profileViewers, getProfileByUserId);
router.get('/', ...partyAOnly, getProfile);
router.patch('/', ...partyAOnly, updateProfile);
router.post(
  '/documents',
  ...partyAOnly,
  profileDocumentUpload,
  handleUploadError,
  uploadDocument
);
router.delete('/documents/:id', ...partyAOnly, deleteDocument);

module.exports = router;

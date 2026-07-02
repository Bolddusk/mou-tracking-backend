const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { profileDocumentUpload, complianceDocumentUpload, handleUploadError } = require('../middleware/upload');
const {
  getProfile,
  getProfileByUserId,
  listPartyAProfiles,
  getSectors,
  updateProfile,
  uploadDocument,
  deleteDocument,
} = require('../controllers/partyAProfileController');
const {
  getProfileByUserId: getPartyBProfileByUserId,
  getPartyBProfileEntry,
  updateProfile: updatePartyBProfile,
  uploadDocument: uploadPartyBDocument,
  deleteDocument: deletePartyBDocument,
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
const profileViewers = [verifyToken, requireRole('party_a', 'sector_lead', 'super_admin')];
const partyBProfileViewers = [
  verifyToken,
  requireRole('party_b', 'investor', 'sector_lead', 'super_admin'),
];
const profileListRoles = [verifyToken, requireRole('sector_lead', 'super_admin')];

router.get('/sectors', verifyToken, getSectors);
router.get('/party-a', ...profileListRoles, listPartyAProfiles);
router.get('/party-b', ...partyBProfileViewers, getPartyBProfileEntry);
router.get('/party-b/:userId', ...partyBProfileViewers, getPartyBProfileByUserId);
router.patch('/party-b', ...partyBOnly, updatePartyBProfile);
router.post(
  '/party-b/documents',
  ...partyBOnly,
  profileDocumentUpload,
  handleUploadError,
  uploadPartyBDocument
);
router.delete('/party-b/documents/:id', ...partyBOnly, deletePartyBDocument);

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

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
  getMyMeta,
  getMyMatrix,
  uploadMyFiling,
  deleteMyFiling,
} = require('../controllers/complianceFilingsController');

const router = express.Router();

const partyAOnly = [verifyToken, requireRole('party_a')];
const profileViewers = [verifyToken, requireRole('party_a', 'sector_lead', 'super_admin')];
const profileListRoles = [verifyToken, requireRole('sector_lead', 'super_admin')];

router.get('/sectors', verifyToken, getSectors);
router.get('/party-a', ...profileListRoles, listPartyAProfiles);

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

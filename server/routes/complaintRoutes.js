const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { complaintDocumentUpload, handleUploadError } = require('../middleware/upload');
const {
  createComplaint,
  uploadDocument,
  getMyComplaints,
  getSectorComplaints,
  getForwardedComplaints,
  getPartyBAssignedComplaints,
  getAllComplaints,
  getComplaintFilterOptions,
  getComplaintStats,
  getComplaintById,
  approveComplaint,
  rejectComplaint,
  escalateComplaint,
  reopenComplaint,
  forwardComplaint,
  returnToSectorLead,
  tagPartyB,
  pokePartyB,
  getPartyBEngagement,
  addPartyBEngagementComment,
  respondToPartyBPoke,
  uploadPartyBEngagementDocument,
  addComment,
} = require('../controllers/complaintController');

const router = express.Router();

const partyA = [verifyToken, requireRole('party_a')];
const partyAB = [verifyToken, requireRole('party_a', 'party_b')];
const partyB = [verifyToken, requireRole('party_b')];
const rfpPartyBEngagement = [
  verifyToken,
  requireRole('regional_focal_point', 'party_b'),
];
const sectorLead = [verifyToken, requireRole('sector_lead')];
const regionalFocalPoint = [verifyToken, requireRole('regional_focal_point')];
const superAdmin = [verifyToken, requireRole('super_admin')];
const reviewers = [verifyToken, requireRole('sector_lead', 'super_admin', 'regional_focal_point')];
const uploadRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'sector_lead', 'regional_focal_point', 'super_admin'),
];
const allComplaintRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'sector_lead', 'super_admin', 'regional_focal_point'),
];
const reopenRoles = [verifyToken, requireRole('party_a', 'party_b', 'super_admin')];

router.post(
  '/upload',
  ...uploadRoles,
  complaintDocumentUpload,
  handleUploadError,
  uploadDocument
);

router.get('/my', ...partyAB, getMyComplaints);
router.get('/party-b-assigned', ...partyB, getPartyBAssignedComplaints);
router.get('/sector', ...sectorLead, getSectorComplaints);
router.get('/forwarded', ...regionalFocalPoint, getForwardedComplaints);
router.get('/filter-options', ...superAdmin, getComplaintFilterOptions);
router.get('/stats', ...superAdmin, getComplaintStats);
router.get('/all', ...superAdmin, getAllComplaints);

router.post(
  '/',
  ...partyAB,
  complaintDocumentUpload,
  handleUploadError,
  createComplaint
);

router.get('/:id', ...allComplaintRoles, getComplaintById);
router.patch('/:id/approve', ...reviewers, approveComplaint);
router.patch('/:id/reject', ...reviewers, rejectComplaint);
router.post('/:id/escalate', ...allComplaintRoles, escalateComplaint);
router.post('/:id/reopen', ...reopenRoles, reopenComplaint);
router.patch('/:id/forward', ...sectorLead, forwardComplaint);
router.patch('/:id/return', ...regionalFocalPoint, returnToSectorLead);
router.post('/:id/tag-party-b', ...regionalFocalPoint, tagPartyB);
router.post('/:id/poke-party-b', ...regionalFocalPoint, pokePartyB);
router.get('/:id/party-b-engagement', ...allComplaintRoles, getPartyBEngagement);
router.post(
  '/:id/party-b-engagement/upload',
  ...rfpPartyBEngagement,
  complaintDocumentUpload,
  handleUploadError,
  uploadPartyBEngagementDocument
);
router.post(
  '/:id/party-b-engagement/comments',
  ...rfpPartyBEngagement,
  complaintDocumentUpload,
  handleUploadError,
  addPartyBEngagementComment
);
router.post(
  '/:id/party-b-engagement/respond',
  ...partyB,
  complaintDocumentUpload,
  handleUploadError,
  respondToPartyBPoke
);
router.post(
  '/:id/comments',
  ...allComplaintRoles,
  complaintDocumentUpload,
  handleUploadError,
  addComment
);

module.exports = router;

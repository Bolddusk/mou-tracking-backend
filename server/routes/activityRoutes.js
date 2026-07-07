const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { activitySupportUpload, handleUploadError } = require('../middleware/upload');
const {
  approveActivity,
  rejectActivity,
  addComment,
  getComments,
  uploadSupportFile,
  respondToPoke,
  updateProgressEntry,
  deleteProgressEntry,
  requestProgressEditUnlock,
  grantProgressEditUnlock,
  getProgressEntry,
} = require('../controllers/activityController');

const router = express.Router();

const activityRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'sector_lead', 'super_admin', 'admin'),
];
const reviewerRoles = [verifyToken, requireRole('sector_lead', 'super_admin', 'admin')];
const sectorLeadRoles = [verifyToken, requireRole('sector_lead')];
const adminRoles = [verifyToken, requireRole('super_admin', 'admin')];

router.post(
  '/upload',
  ...activityRoles,
  activitySupportUpload,
  handleUploadError,
  uploadSupportFile
);

router.post(
  '/:activityId/respond',
  verifyToken,
  requireRole('party_a'),
  respondToPoke
);

router.patch('/:activityId/approve', ...reviewerRoles, approveActivity);
router.patch('/:activityId/reject', ...reviewerRoles, rejectActivity);
router.get('/:activityId', ...activityRoles, getProgressEntry);
router.patch('/:activityId', ...activityRoles, updateProgressEntry);
router.delete('/:activityId', ...activityRoles, deleteProgressEntry);
router.post('/:activityId/comments', ...activityRoles, addComment);
router.get('/:activityId/comments', ...activityRoles, getComments);
router.post('/:activityId/request-edit-unlock', ...sectorLeadRoles, requestProgressEditUnlock);
router.patch('/:activityId/grant-edit-unlock', ...adminRoles, grantProgressEditUnlock);

module.exports = router;

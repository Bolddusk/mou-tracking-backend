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
} = require('../controllers/activityController');

const router = express.Router();

const activityRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'sector_lead', 'super_admin'),
];
const reviewerRoles = [verifyToken, requireRole('sector_lead', 'super_admin')];

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
router.post('/:activityId/comments', ...activityRoles, addComment);
router.get('/:activityId/comments', ...activityRoles, getComments);

module.exports = router;

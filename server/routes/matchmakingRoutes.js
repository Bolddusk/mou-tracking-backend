const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { proposalUpload, handleUploadError } = require('../middleware/upload');
const {
  saveDraft,
  submitProposal,
  uploadFile,
  getProposalDetail,
  getMyProposals,
  getFocalPointQueue,
  shortlistProposal,
  rejectProposal,
  forwardProposal,
  getForwardedToMe,
  getAllForMatching,
  createMatch,
  getMatcherMatches,
  getMyMatches,
  getAllMatches,
} = require('../controllers/matchmakingController');
const {
  getMatchDetail,
  getMatchMou,
  uploadMatchMou,
  getMatchMouStatus,
  acknowledgeMatchMou,
  getMatchMouVersions,
  getMatchByEngagement,
} = require('../controllers/matchmakingMatchController');
const { closeMatchDeal } = require('../controllers/dealCloseController');

const router = express.Router();

const submitterRoles = [verifyToken, requireRole('party_a', 'investor')];
const focalPointRoles = [verifyToken, requireRole('focal_point', 'regional_focal_point')];
const reviewerRoles = [
  verifyToken,
  requireRole('focal_point', 'regional_focal_point', 'sector_lead'),
];
const matcherRoles = [
  verifyToken,
  requireRole('sector_lead', 'focal_point', 'regional_focal_point', 'super_admin'),
];
const matcherViewRoles = [
  verifyToken,
  requireRole('sector_lead', 'focal_point', 'regional_focal_point'),
];
const forwardedRoles = [
  verifyToken,
  requireRole('sector_lead', 'focal_point', 'regional_focal_point'),
];
const proposalDetailRoles = [
  verifyToken,
  requireRole(
    'party_a',
    'investor',
    'focal_point',
    'regional_focal_point',
    'sector_lead',
    'super_admin'
  ),
];
const matchViewerRoles = [
  verifyToken,
  requireRole('party_a', 'investor', 'sector_lead', 'focal_point', 'regional_focal_point', 'super_admin'),
];
const mouViewRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'investor', 'sector_lead', 'super_admin', 'focal_point', 'regional_focal_point'),
];
const mouAckRoles = [verifyToken, requireRole('party_a', 'party_b', 'investor')];
const mouStatusViewRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'investor', 'sector_lead', 'super_admin'),
];
const mouUploadRoles = [verifyToken, requireRole('party_a', 'party_b', 'sector_lead', 'super_admin')];
const dealCloseRoles = [verifyToken, requireRole('sector_lead', 'super_admin')];
const engagementLookupRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'investor', 'sector_lead', 'super_admin', 'focal_point', 'regional_focal_point'),
];

router.post('/proposals/draft', ...submitterRoles, saveDraft);
router.post('/proposals/submit', ...submitterRoles, submitProposal);
router.post('/proposals/upload', ...submitterRoles, proposalUpload, handleUploadError, uploadFile);
router.get('/proposals/my', ...submitterRoles, getMyProposals);
router.get('/proposals/focal-point', ...focalPointRoles, getFocalPointQueue);
router.patch('/proposals/:id/shortlist', ...reviewerRoles, shortlistProposal);
router.patch('/proposals/:id/reject', ...reviewerRoles, rejectProposal);
router.patch('/proposals/:id/forward', ...reviewerRoles, forwardProposal);
router.get('/proposals/forwarded-to-me', ...forwardedRoles, getForwardedToMe);
router.get('/proposals/all-for-matching', ...matcherRoles, getAllForMatching);
router.get('/proposals/:id', ...proposalDetailRoles, getProposalDetail);

router.get('/matches/matched', ...matcherViewRoles, getMatcherMatches);
router.post('/matches', ...matcherRoles, createMatch);
router.get('/matches/my', ...submitterRoles, getMyMatches);
router.get('/matches/all', verifyToken, requireRole('super_admin'), getAllMatches);
router.get('/matches/:id', ...matchViewerRoles, getMatchDetail);

router.get('/engagement/:engagementProposalId/match', ...engagementLookupRoles, getMatchByEngagement);
router.patch('/matches/:id/close-deal', ...dealCloseRoles, closeMatchDeal);
router.get('/matches/:id/mou/status', ...mouStatusViewRoles, getMatchMouStatus);
router.get('/matches/:id/mou/versions', ...mouStatusViewRoles, getMatchMouVersions);
router.patch('/matches/:id/mou/acknowledge', ...mouAckRoles, acknowledgeMatchMou);
router.get('/matches/:id/mou', ...mouViewRoles, getMatchMou);
router.patch('/matches/:id/mou', ...mouUploadRoles, proposalUpload, handleUploadError, uploadMatchMou);

module.exports = router;

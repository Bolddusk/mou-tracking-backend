const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { proposalUpload, handleUploadError } = require('../middleware/upload');
const {
  saveDraft,
  submitProposal,
  resubmitProposal,
  uploadFile,
  getMyProposals,
  deleteProposal,
} = require('../controllers/proposalController');
const {
  getSectorLeadProposals,
  getAllProposals,
  getProposalFilterOptions,
  getProposalDetail,
  approveProposal,
  rejectProposal,
} = require('../controllers/reviewController');
const {
  createActivity,
  getProposalActivities,
  pokeForUpdate,
} = require('../controllers/activityController');
const { getProposalChatMessages } = require('../controllers/proposalChatController');
const { exportProposalReport } = require('../controllers/proposalReportController');
const { getProposalMou, saveProposalMou, getProposalMouStatus, acknowledgeProposalMou, getProposalMouVersions } = require('../controllers/proposalMouController');
const { closeProposalDeal } = require('../controllers/dealCloseController');
const { updateProposalPartyContacts } = require('../controllers/proposalPartyContactController');

const router = express.Router();

const proposalAuthorRoles = [verifyToken, requireRole('party_a', 'super_admin')];
const partyMyProposals = [verifyToken, requireRole('party_a', 'party_b', 'investor')];
const partyChatRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'investor', 'sector_lead', 'super_admin', 'regional_focal_point', 'focal_point'),
];
const sectorLeadOnly = [verifyToken, requireRole('sector_lead')];
const superAdminOnly = [verifyToken, requireRole('super_admin')];
const reviewerRoles = [verifyToken, requireRole('sector_lead', 'super_admin')];
const activityRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'investor', 'sector_lead', 'super_admin', 'regional_focal_point'),
];
const mouViewRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'investor', 'sector_lead', 'super_admin', 'regional_focal_point'),
];
const mouAckRoles = [verifyToken, requireRole('party_a', 'party_b', 'investor')];
const mouStatusViewRoles = [
  verifyToken,
  requireRole('party_a', 'party_b', 'investor', 'sector_lead', 'super_admin'),
];

const partyAResubmit = [verifyToken, requireRole('party_a')];

// Party A + Super Admin (MOUS create / edit)
router.post('/draft', ...proposalAuthorRoles, saveDraft);
router.post('/submit', ...proposalAuthorRoles, submitProposal);
router.patch('/:id/resubmit', ...partyAResubmit, resubmitProposal);
router.post('/upload', ...proposalAuthorRoles, proposalUpload, handleUploadError, uploadFile);
router.get('/my', ...partyMyProposals, getMyProposals);
router.delete('/:id', ...proposalAuthorRoles, deleteProposal);

// Sector Lead
router.get('/sector-lead', ...sectorLeadOnly, getSectorLeadProposals);

// Super Admin
router.get('/filter-options', ...superAdminOnly, getProposalFilterOptions);
router.get('/all', ...superAdminOnly, getAllProposals);

// Activities (before /:id)
router.post('/:proposalId/activities', ...activityRoles, createActivity);
router.get('/:proposalId/activities', ...activityRoles, getProposalActivities);
router.get('/:proposalId/messages', ...partyChatRoles, getProposalChatMessages);
router.post('/:proposalId/poke', ...reviewerRoles, pokeForUpdate);

// Proposal review
router.patch('/:id/approve', ...reviewerRoles, approveProposal);
router.patch('/:id/reject', ...reviewerRoles, rejectProposal);
router.patch('/:id/party-contacts', ...reviewerRoles, updateProposalPartyContacts);

// Export report (sector lead / super admin) — before /:id
router.get('/:id/export-report', ...reviewerRoles, exportProposalReport);

const mouUploadRoles = [verifyToken, requireRole('party_a', 'party_b', 'sector_lead', 'super_admin')];
const dealCloseRoles = [verifyToken, requireRole('sector_lead', 'super_admin')];

// Direct opportunity MOU (Party A fills all — legacy proposals table)
router.patch('/:id/close-deal', ...dealCloseRoles, closeProposalDeal);
router.get('/:id/mou/status', ...mouStatusViewRoles, getProposalMouStatus);
router.get('/:id/mou/versions', ...mouStatusViewRoles, getProposalMouVersions);
router.patch('/:id/mou/acknowledge', ...mouAckRoles, acknowledgeProposalMou);
router.get('/:id/mou', ...mouViewRoles, getProposalMou);
router.patch('/:id/mou', ...mouUploadRoles, proposalUpload, handleUploadError, saveProposalMou);

// Detail — party_a (own), sector_lead, super_admin
router.get('/:id', ...activityRoles, getProposalDetail);

module.exports = router;

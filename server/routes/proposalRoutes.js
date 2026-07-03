const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const { requireAnyPermission } = require('../middleware/requirePermission');
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
const { getConferenceReport } = require('../controllers/conferenceReportController');
const { getProposalMou, saveProposalMou, getProposalMouStatus, acknowledgeProposalMou, getProposalMouVersions } = require('../controllers/proposalMouController');
const { closeProposalDeal } = require('../controllers/dealCloseController');
const { updateProposalPartyContacts } = require('../controllers/proposalPartyContactController');
const {
  getProposalEditableFields,
  updateProposalFields,
} = require('../controllers/proposalFieldsController');

const router = express.Router();

const proposalAuthorRoles = [verifyToken, requireRole('party_a', 'super_admin')];
const partyMyProposals = [verifyToken, requireAnyPermission('proposals.list_own', 'proposals.view_own')];
const sectorLeadList = [
  verifyToken,
  requireAnyPermission('proposals.list_sector'),
];
const allProposalsList = [
  verifyToken,
  requireRole('super_admin'),
  requireAnyPermission('proposals.list_all'),
];
const reviewerListRoles = [
  verifyToken,
  requireAnyPermission(
    'proposals.list_all',
    'proposals.list_sector',
    'proposals.list_own',
    'proposals.filter_options'
  ),
];
const approveProposalRoles = [verifyToken, requireAnyPermission('proposals.approve')];
const rejectProposalRoles = [verifyToken, requireAnyPermission('proposals.reject')];
const exportReportRoles = [verifyToken, requireAnyPermission('proposals.export')];
const conferenceReportRoles = [
  verifyToken,
  requireRole('super_admin', 'admin', 'sector_lead'),
];
const editContactsRoles = [verifyToken, requireAnyPermission('proposals.edit_contacts')];
const proposalViewRoles = [
  verifyToken,
  requireAnyPermission('proposals.view', 'proposals.view_detail', 'proposals.view_own'),
];
const activitiesViewRoles = [verifyToken, requireAnyPermission('proposals.activities.view')];
const activitiesCreateRoles = [verifyToken, requireAnyPermission('proposals.activities.create')];
const messagesViewRoles = [verifyToken, requireAnyPermission('proposals.messages.view')];
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

// Sector Lead / permission-scoped list
router.get('/sector-lead', ...sectorLeadList, getSectorLeadProposals);

// Sector Lead + Super Admin (filter dropdowns)
router.get('/filter-options', ...reviewerListRoles, getProposalFilterOptions);
router.get('/conference-report', ...conferenceReportRoles, getConferenceReport);
router.get('/all', ...allProposalsList, getAllProposals);

// Activities (before /:id)
router.post('/:proposalId/activities', ...activitiesCreateRoles, createActivity);
router.get('/:proposalId/activities', ...activitiesViewRoles, getProposalActivities);
router.get('/:proposalId/messages', ...messagesViewRoles, getProposalChatMessages);
router.post('/:proposalId/poke', ...approveProposalRoles, pokeForUpdate);

// Proposal review
router.patch('/:id/approve', ...approveProposalRoles, approveProposal);
router.patch('/:id/reject', ...rejectProposalRoles, rejectProposal);
router.patch('/:id/party-contacts', ...editContactsRoles, updateProposalPartyContacts);
router.get('/:id/editable-fields', ...proposalViewRoles, getProposalEditableFields);
router.patch('/:id/fields', ...proposalViewRoles, updateProposalFields);

// Export report — before /:id
router.get('/:id/export-report', ...exportReportRoles, exportProposalReport);

const mouUploadRoles = [verifyToken, requireRole('party_a', 'party_b', 'sector_lead', 'super_admin')];
const dealCloseRoles = [verifyToken, requireAnyPermission('proposals.deal_close')];

// Direct opportunity MOU (Party A fills all — legacy proposals table)
router.patch('/:id/close-deal', ...dealCloseRoles, closeProposalDeal);
router.get('/:id/mou/status', ...mouStatusViewRoles, getProposalMouStatus);
router.get('/:id/mou/versions', ...mouStatusViewRoles, getProposalMouVersions);
router.patch('/:id/mou/acknowledge', ...mouAckRoles, acknowledgeProposalMou);
router.get('/:id/mou', ...mouViewRoles, getProposalMou);
router.patch('/:id/mou', ...mouUploadRoles, proposalUpload, handleUploadError, saveProposalMou);

// Detail — party_a (own), sector_lead, super_admin
router.get('/:id', ...proposalViewRoles, getProposalDetail);

module.exports = router;

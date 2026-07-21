const pool = require('../config/db');
const { isProposalLocked, canCloseProposalDeal } = require('./dealClose');
const { permissionMatchesGrant } = require('./rolePermissions');
const { sectorLeadCoversSector, sectorLeadHasAnySector } = require('./sectorLeadAssignments');
const {
  isSuperAdmin,
  isPowerAdmin,
  isGlobalRole,
  assertMinistryAccess,
} = require('./ministryScope');

async function getMatchForEngagement(proposalId) {
  const [rows] = await pool.query(
    `SELECT * FROM mm_matches WHERE engagement_proposal_id = ? LIMIT 1`,
    [proposalId]
  );
  return rows[0] || null;
}

async function isMatchEngagementStakeholder(userId, proposalId) {
  const [rows] = await pool.query(
    `SELECT m.id FROM mm_matches m
     LEFT JOIN mm_proposals sa ON sa.id = m.side_a_proposal_id
     LEFT JOIN mm_proposals sb ON sb.id = m.side_b_proposal_id
     WHERE m.engagement_proposal_id = ?
       AND (
         m.matched_by = ?
         OR sa.forwarded_to = ?
         OR sb.forwarded_to = ?
         OR sa.reviewed_by = ?
         OR sb.reviewed_by = ?
       )
     LIMIT 1`,
    [proposalId, userId, userId, userId, userId, userId]
  );
  return rows.length > 0;
}

/** @deprecated use isMatchEngagementStakeholder */
async function hasRfpApprovedMatchAccess(userId, proposalId) {
  return isMatchEngagementStakeholder(userId, proposalId);
}

async function sectorLeadCanAccessProposal(req, proposal) {
  if (proposal.status === 'draft') {
    return { ok: false, reason: 'draft' };
  }
  if (sectorLeadCoversSector(req.user, proposal.sector)) {
    return { ok: true, viaMatchmaking: false };
  }
  const matched = await getMatchForEngagement(proposal.id);
  if (matched && matched.matched_by === req.user.id) {
    return { ok: true, viaMatchmaking: true };
  }
  return { ok: false };
}

async function checkProposalAccess(req, proposal) {
  if (!proposal) {
    return { error: 'Proposal not found', status: 404 };
  }

  const { isProposalArchived, canArchiveProposals } = require('./proposalSoftDelete');
  if (isProposalArchived(proposal) && !canArchiveProposals(req.user)) {
    return { error: 'Proposal not found', status: 404 };
  }

  if (isSuperAdmin(req.user) || isPowerAdmin(req.user)) {
    return { ok: true, proposal };
  }

  if (req.user.role === 'admin') {
    const ministryCheck = assertMinistryAccess(req.user, proposal.ministry_id);
    if (!ministryCheck.ok) return ministryCheck;
    return { ok: true, proposal };
  }

  if (req.user.role === 'party_a') {
    if (proposal.party_a_id !== req.user.id) {
      return { error: 'Access denied', status: 403 };
    }
    return { ok: true, proposal };
  }

  if (req.user.role === 'party_b') {
    if (proposal.party_b_user_id !== req.user.id) {
      return { error: 'Access denied', status: 403 };
    }
    if (proposal.status === 'draft') {
      return { error: 'Access denied', status: 403 };
    }
    return { ok: true, proposal };
  }

  if (req.user.role === 'investor') {
    if (proposal.party_b_user_id !== req.user.id) {
      return { error: 'Access denied', status: 403 };
    }
    if (proposal.status === 'draft') {
      return { error: 'Access denied', status: 403 };
    }
    return { ok: true, proposal };
  }

  if (req.user.role === 'sector_lead') {
    const ministryCheck = assertMinistryAccess(req.user, proposal.ministry_id);
    if (!ministryCheck.ok) return ministryCheck;
    if (!sectorLeadHasAnySector(req.user)) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    const slAccess = await sectorLeadCanAccessProposal(req, proposal);
    if (!slAccess.ok) {
      const error =
        slAccess.reason === 'draft'
          ? 'Access denied — proposal not yet submitted'
          : 'Access denied';
      return { error, status: 403 };
    }
    return { ok: true, proposal, viaMatchmaking: slAccess.viaMatchmaking };
  }

  if (['regional_focal_point', 'focal_point'].includes(req.user.role)) {
    if (proposal.status !== 'approved') {
      return { error: 'Access denied — engagement not active', status: 403 };
    }
    const allowed = await isMatchEngagementStakeholder(req.user.id, proposal.id);
    if (!allowed) {
      return { error: 'Access denied', status: 403 };
    }
    return { ok: true, proposal, readOnly: true };
  }

  return { error: 'Access denied', status: 403 };
}

function canEditProposalFields(req, proposal, access) {
  if (!access?.ok) {
    return { ok: false, error: access?.error || 'Access denied', status: access?.status || 403 };
  }

  const locked = isProposalLocked(proposal);
  if (locked && !['super_admin', 'admin', 'power_admin'].includes(req.user.role)) {
    return {
      ok: false,
      locked: true,
      error: 'Deal is closed — fields cannot be edited',
      status: 400,
    };
  }

  const { isProposalArchived } = require('./proposalSoftDelete');
  if (isProposalArchived(proposal)) {
    return { ok: false, error: 'Archived MOUs cannot be edited', status: 400 };
  }

  if (proposal.status === 'draft') {
    if (req.user.role === 'party_a' && proposal.party_a_id === req.user.id) {
      return { ok: true, locked: false };
    }
    if (['super_admin', 'admin', 'power_admin'].includes(req.user.role)) {
      return { ok: true, locked: false };
    }
    return { ok: false, error: 'Only the proposal owner can edit drafts', status: 403 };
  }

  return { ok: true, locked };
}

async function checkApprovedPartyChatAccess(user, proposal) {
  if (!proposal) {
    return { error: 'Proposal not found', status: 404 };
  }

  if (proposal.status !== 'approved') {
    return { error: 'Chat is only available after proposal approval', status: 403 };
  }

  // Anyone already linked / staff can chat. Party B joins when party_b_user_id is set.
  const partyBLinked = Boolean(proposal.party_b_user_id);

  if (user.role === 'party_a' && proposal.party_a_id === user.id) {
    return { ok: true, proposal, canSend: true, partyBLinked };
  }

  if (partyBLinked && user.role === 'party_b' && proposal.party_b_user_id === user.id) {
    return { ok: true, proposal, canSend: true, partyBLinked };
  }

  if (partyBLinked && user.role === 'investor' && proposal.party_b_user_id === user.id) {
    return { ok: true, proposal, canSend: true, partyBLinked };
  }

  if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'power_admin') {
    if (user.role === 'admin') {
      const ministryCheck = assertMinistryAccess(user, proposal.ministry_id);
      if (!ministryCheck.ok) return ministryCheck;
    }
    return { ok: true, proposal, canSend: true, partyBLinked };
  }

  if (user.role === 'sector_lead') {
    const ministryCheck = assertMinistryAccess(user, proposal.ministry_id);
    if (!ministryCheck.ok) return ministryCheck;
    if (!sectorLeadHasAnySector(user)) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    if (sectorLeadCoversSector(user, proposal.sector)) {
      return { ok: true, proposal, canSend: true, partyBLinked };
    }
    const match = await getMatchForEngagement(proposal.id);
    if (match && match.matched_by === user.id) {
      return { ok: true, proposal, canSend: true, partyBLinked };
    }
    return { error: 'Access denied — proposal is outside your sector', status: 403 };
  }

  if (['regional_focal_point', 'focal_point'].includes(user.role)) {
    const allowed = await isMatchEngagementStakeholder(user.id, proposal.id);
    if (!allowed) {
      return { error: 'Access denied', status: 403 };
    }
    return { ok: true, proposal, canSend: false, partyBLinked };
  }

  if (!partyBLinked && (user.role === 'party_b' || user.role === 'investor')) {
    return { error: 'Your account is not linked to this proposal yet', status: 403 };
  }

  return { error: 'Access denied', status: 403 };
}

function isProposalOwnerForActivities(req, proposal) {
  if (req.user.role === 'party_a') {
    return proposal.party_a_id === req.user.id;
  }
  if (req.user.role === 'party_b') {
    return proposal.party_b_user_id === req.user.id;
  }
  return false;
}

function canEditMouTextFields(req, proposal) {
  const role = req.user.role;
  if (['super_admin', 'admin', 'power_admin'].includes(role)) return true;
  if (role === 'party_a' && proposal.party_a_id === req.user.id) return true;
  if (role === 'party_b' && proposal.party_b_user_id === req.user.id) return true;
  return false;
}

function applyMouFieldCapabilities(req, proposal, caps) {
  caps.can_edit_mou_fields = canEditMouTextFields(req, proposal);
  caps.can_delete_mou = Boolean(caps.can_upload_mou && proposal?.mou_file_url);
  return caps;
}

function isHistoricExemptProposal(proposal) {
  return Boolean(proposal?.mou_ack_exempt);
}

function chatReady(proposal) {
  // Approved MOUs can open chat for linked Party A + staff; Party B when linked.
  return proposal.status === 'approved';}

function canDeleteProposal(user, proposal) {
  if (!proposal || !user) return false;
  if (!['draft', 'rejected'].includes(proposal.status)) return false;
  if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'power_admin') {
    return true;
  }
  if (user.role === 'party_a' && Number(proposal.party_a_id) === Number(user.id)) return true;
  return false;
}

function buildProposalCapabilities(req, proposal, access, userPermissions = null) {
  const caps = {
    can_view_chat: false,
    can_send_chat: false,
    can_add_activity: false,
    can_comment: false,
    can_upload_mou: false,
    can_delete_mou: false,
    can_delete: false,
    can_edit_mou_fields: false,
    can_view_mou: false,
    can_close_deal: false,
    can_view_companies: false,
    can_edit_party_contacts: false,
    can_edit_party_a_contacts: false,
    can_edit_party_b_contacts: false,
    can_edit_fields: false,
    can_approve: false,
    can_reject: false,
  };

  if (!access.ok) return caps;

  caps.can_delete = canDeleteProposal(req.user, proposal);

  const editAccess = canEditProposalFields(req, proposal, access);
  caps.can_edit_fields = editAccess.ok;

  const role = req.user.role;
  const perms = userPermissions || req.userPermissions || [];
  const reviewable = ['submitted', 'resubmitted'].includes(proposal.status);
  const ready = chatReady(proposal);
  const locked = isProposalLocked(proposal);
  const approvedAndOpen = proposal.status === 'approved' && !locked;
  const mouVisible = proposal.status === 'approved' || proposal.status === 'completed';

  const canApproveReject =
    reviewable &&
    (role === 'super_admin' ||
      role === 'power_admin' ||
      (permissionMatchesGrant('proposals.approve', perms) &&
        role === 'sector_lead' &&
        proposal.status !== 'draft' &&
        (sectorLeadCoversSector(req.user, proposal.sector) || access.viaMatchmaking)));

  if (canApproveReject) {
    caps.can_approve =
      role === 'super_admin' ||
      role === 'power_admin' ||
      permissionMatchesGrant('proposals.approve', perms);
    caps.can_reject =
      role === 'super_admin' ||
      role === 'power_admin' ||
      permissionMatchesGrant('proposals.reject', perms);
  }

  if (role === 'power_admin' || role === 'super_admin') {
    caps.can_view_chat = ready && !locked;
    caps.can_send_chat = ready && !locked;
    caps.can_comment = true;
    caps.can_add_activity = approvedAndOpen;
    caps.can_upload_mou = approvedAndOpen;
    caps.can_view_mou = mouVisible;
    caps.can_view_companies = true;
    caps.can_close_deal = canCloseProposalDeal(req, proposal);
    const canEditContacts = proposal.status !== 'draft';
    caps.can_edit_party_contacts = canEditContacts;
    caps.can_edit_party_a_contacts = canEditContacts;
    caps.can_edit_party_b_contacts = canEditContacts;
    if (reviewable) {
      caps.can_approve = true;
      caps.can_reject = true;
    }
    return applyMouFieldCapabilities(req, proposal, caps);
  }

  if (role === 'party_a' && proposal.party_a_id === req.user.id) {
    caps.can_view_chat = ready && !locked;
    caps.can_send_chat = ready && !locked;
    caps.can_add_activity = approvedAndOpen;
    caps.can_upload_mou = approvedAndOpen;
    caps.can_view_mou = mouVisible;
    caps.can_view_companies = true;
    // Party A may edit own contacts only (not Party B) — use can_edit_party_a_contacts
    caps.can_edit_party_a_contacts = proposal.status !== 'draft';
    caps.can_edit_party_b_contacts = false;
    caps.can_edit_party_contacts = false;
    return applyMouFieldCapabilities(req, proposal, caps);
  }

  if (role === 'party_b' && proposal.party_b_user_id === req.user.id) {
    caps.can_view_chat = ready && !locked;
    caps.can_send_chat = ready && !locked;
    caps.can_upload_mou = approvedAndOpen;
    caps.can_view_mou = mouVisible;
    caps.can_view_companies = true;
    // Party B may edit own contacts only (not Party A) — mirror of Party A
    caps.can_edit_party_a_contacts = false;
    caps.can_edit_party_b_contacts = proposal.status !== 'draft';
    caps.can_edit_party_contacts = false;
    return applyMouFieldCapabilities(req, proposal, caps);
  }

  if (role === 'investor' && proposal.party_b_user_id === req.user.id) {
    caps.can_view_chat = ready && !locked;
    caps.can_send_chat = ready && !locked;
    caps.can_view_mou = mouVisible;
    return caps;
  }

  const sectorLeadAllowed =
    role === 'sector_lead' &&
    proposal.status !== 'draft' &&
    (sectorLeadCoversSector(req.user, proposal.sector) || access.viaMatchmaking);

  if (sectorLeadAllowed) {
    caps.can_view_chat = ready && !locked;
    caps.can_send_chat = ready && !locked;
    caps.can_add_activity = approvedAndOpen;
    caps.can_upload_mou = approvedAndOpen && permissionMatchesGrant('proposals.mou.upload', perms);
    caps.can_view_mou = mouVisible;
    caps.can_view_companies = true;
    caps.can_close_deal =
      canCloseProposalDeal(req, proposal) && permissionMatchesGrant('proposals.deal_close', perms);
    const canEditContacts = permissionMatchesGrant('proposals.edit_contacts', perms);
    caps.can_edit_party_contacts = canEditContacts;
    caps.can_edit_party_a_contacts = canEditContacts;
    caps.can_edit_party_b_contacts = canEditContacts;
    return applyMouFieldCapabilities(req, proposal, caps);
  }

  if (role === 'admin') {
    caps.can_view_chat = ready && !locked;
    caps.can_send_chat = ready && !locked;
    caps.can_add_activity = approvedAndOpen;
    caps.can_upload_mou = approvedAndOpen;
    caps.can_view_mou = mouVisible;
    caps.can_view_companies = true;
    caps.can_close_deal = canCloseProposalDeal(req, proposal);
    const canEditContacts = proposal.status !== 'draft';
    caps.can_edit_party_contacts = canEditContacts;
    caps.can_edit_party_a_contacts = canEditContacts;
    caps.can_edit_party_b_contacts = canEditContacts;
    if (reviewable) {
      caps.can_approve = permissionMatchesGrant('proposals.approve', perms);
      caps.can_reject = permissionMatchesGrant('proposals.reject', perms);
    }
    return applyMouFieldCapabilities(req, proposal, caps);
  }

  if (['regional_focal_point', 'focal_point'].includes(role) && access.readOnly && mouVisible) {
    caps.can_view_chat = ready && !locked;
    caps.can_send_chat = false;
    caps.can_add_activity = false;
    caps.can_upload_mou = false;
    caps.can_view_mou = true;
    return caps;
  }

  return caps;
}

module.exports = {
  checkProposalAccess,
  canEditProposalFields,
  canEditMouTextFields,
  canDeleteProposal,
  checkApprovedPartyChatAccess,
  isProposalOwnerForActivities,
  hasRfpApprovedMatchAccess,
  isMatchEngagementStakeholder,
  getMatchForEngagement,
  sectorLeadCanAccessProposal,
  buildProposalCapabilities,
};

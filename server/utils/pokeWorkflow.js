const pool = require('../config/db');
const { enrichProposalRow } = require('./proposalTemplate');
const { buildPartyAContactsDisplay } = require('./partyContactsDisplay');
const { isProposalLocked } = require('./dealClose');
const { POKE_TITLE } = require('./progressActivity');

const REVIEWER_ROLES = new Set(['sector_lead', 'super_admin', 'admin']);

function resolvePartyAEmail(proposalRow) {
  if (!proposalRow) return null;
  const enriched = enrichProposalRow(proposalRow);
  const email = buildPartyAContactsDisplay(enriched).login_email;
  return email || null;
}

const PARTY_A_EMAIL_MISSING_MESSAGE =
  'Put email for Party A in Companies tab before requesting an update';

function derivePokeWorkflowStatus(poke) {
  if (!poke || poke.poke_dismissed_at || poke.response_promoted_at) return 'none';
  if (!poke.response_submitted_at) return 'pending_response';
  return 'awaiting_review';
}

function formatPokeResponsePayload(poke) {
  if (!poke?.response_submitted_at) return null;
  const activityDate = poke.response_date
    ? new Date(poke.response_date).toISOString().slice(0, 10)
    : null;
  return {
    work_date: activityDate,
    activity_date: activityDate,
    title: poke.response_title || '',
    description: poke.response_description || '',
    support_file_url: poke.response_support_file_url || '',
    submitted_at: poke.response_submitted_at,
    submitted_by_name: poke.response_by_name || '',
    promoted_at: poke.response_promoted_at || null,
    promoted_progress_activity_id: poke.promoted_progress_activity_id || null,
  };
}

function buildPokeWorkflowCapabilities(req, proposal, poke) {
  const role = req.user?.role;
  const isReviewer = REVIEWER_ROLES.has(role);
  const isPartyA = role === 'party_a' && proposal?.party_a_id === req.user?.id;
  const email = resolvePartyAEmail(proposal);
  const status = derivePokeWorkflowStatus(poke);
  const approvedOpen = proposal?.status === 'approved' && !isProposalLocked(proposal);

  return {
    party_a_has_email: Boolean(email),
    party_a_contact_email: email || null,
    request_update_hint: email ? null : PARTY_A_EMAIL_MISSING_MESSAGE,
    update_request_status: status,
    can_request_update: isReviewer && approvedOpen && Boolean(email) && status === 'none',
    can_respond_to_update_request: isPartyA && status === 'pending_response',
    can_edit_update_response: isReviewer && status === 'awaiting_review',
    can_promote_update_to_progress: isReviewer && status === 'awaiting_review',
    can_dismiss_update_request:
      role === 'super_admin' && poke && status !== 'none',
  };
}

async function getLatestOpenPoke(proposalId) {
  const [rows] = await pool.query(
    `SELECT a.*,
            u.full_name AS poked_by_name,
            ru.full_name AS response_by_name
     FROM proposal_activities a
     JOIN users u ON u.id = a.added_by
     LEFT JOIN users ru ON ru.id = a.response_by
     WHERE a.proposal_id = ?
       AND a.title = ?
       AND a.poke_dismissed_at IS NULL
       AND a.response_promoted_at IS NULL
     ORDER BY a.created_at DESC
     LIMIT 1`,
    [proposalId, POKE_TITLE]
  );
  return rows[0] || null;
}

function validatePokeEligibility(proposal) {
  const email = resolvePartyAEmail(proposal);
  if (!email) {
    return {
      ok: false,
      status: 400,
      error: PARTY_A_EMAIL_MISSING_MESSAGE,
      code: 'party_a_email_missing',
    };
  }
  return { ok: true, party_a_email: email };
}

async function assertCanCreatePoke(proposal) {
  const eligibility = validatePokeEligibility(proposal);
  if (!eligibility.ok) return eligibility;

  if (proposal.status !== 'approved') {
    return { ok: false, status: 400, error: 'Update requests are only allowed on approved MOUs' };
  }

  if (isProposalLocked(proposal)) {
    return { ok: false, status: 400, error: 'This MOU is locked — update requests are disabled' };
  }

  const openPoke = await getLatestOpenPoke(proposal.id);
  if (openPoke) {
    const status = derivePokeWorkflowStatus(openPoke);
    if (status === 'pending_response') {
      return {
        ok: false,
        status: 400,
        error: 'An update request is already pending — waiting for Party A response',
        code: 'update_request_pending',
      };
    }
    return {
      ok: false,
      status: 400,
      error: 'Party A already submitted an update — review or promote it before sending a new request',
      code: 'update_request_awaiting_review',
    };
  }

  return { ok: true };
}

async function dismissAllPendingUpdateRequests(userId) {
  const [result] = await pool.query(
    `UPDATE proposal_activities
     SET poke_dismissed_at = NOW(), poke_dismissed_by = ?
     WHERE title = ?
       AND poke_dismissed_at IS NULL
       AND response_promoted_at IS NULL
       AND response_submitted_at IS NULL`,
    [userId, POKE_TITLE]
  );
  return { dismissed_count: result.affectedRows || 0 };
}

async function dismissUpdateRequest(activityId, userId) {
  const [result] = await pool.query(
    `UPDATE proposal_activities
     SET poke_dismissed_at = NOW(), poke_dismissed_by = ?
     WHERE id = ?
       AND title = ?
       AND poke_dismissed_at IS NULL
       AND response_promoted_at IS NULL`,
    [userId, activityId, POKE_TITLE]
  );
  return result.affectedRows > 0;
}

module.exports = {
  POKE_TITLE,
  REVIEWER_ROLES,
  resolvePartyAEmail,
  derivePokeWorkflowStatus,
  formatPokeResponsePayload,
  buildPokeWorkflowCapabilities,
  getLatestOpenPoke,
  validatePokeEligibility,
  assertCanCreatePoke,
  dismissAllPendingUpdateRequests,
  dismissUpdateRequest,
  PARTY_A_EMAIL_MISSING_MESSAGE,
};

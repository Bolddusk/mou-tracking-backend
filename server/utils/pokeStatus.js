const pool = require('../config/db');
const {
  POKE_TITLE,
  derivePokeWorkflowStatus,
  formatPokeResponsePayload,
} = require('./pokeWorkflow');

const ROLE_LABELS = {
  sector_lead: 'Sector Lead',
  super_admin: 'Super Admin',
  admin: 'Admin',
};

async function attachPokeStatus(proposals) {
  if (!proposals.length) return proposals;

  const ids = proposals.map((p) => p.id);

  const [pokes] = await pool.query(
    `SELECT a.proposal_id, a.id, a.added_by_role, a.created_at,
            a.response_submitted_at, a.response_title, a.response_description,
            a.response_date, a.response_support_file_url, a.response_promoted_at,
            a.promoted_progress_activity_id, u.full_name AS poked_by_name
     FROM proposal_activities a
     JOIN users u ON u.id = a.added_by
     WHERE a.proposal_id IN (?)
       AND a.title = ?
       AND a.poke_dismissed_at IS NULL
       AND a.response_promoted_at IS NULL
     ORDER BY a.created_at DESC`,
    [ids, POKE_TITLE]
  );

  const latestPokeByProposal = {};
  for (const poke of pokes) {
    if (!latestPokeByProposal[poke.proposal_id]) {
      latestPokeByProposal[poke.proposal_id] = poke;
    }
  }

  return proposals.map((proposal) => {
    const poke = latestPokeByProposal[proposal.id];
    if (!poke) {
      return { ...proposal, poke_status: buildPokeStatus('none') };
    }

    const workflowStatus = derivePokeWorkflowStatus(poke);
    return {
      ...proposal,
      poke_status: buildPokeStatus(workflowStatus, poke),
    };
  });
}

function buildPokeStatus(status, poke = null) {
  if (status === 'none') {
    return {
      status: 'none',
      label: '—',
      short_label: '—',
    };
  }

  const who = ROLE_LABELS[poke.added_by_role] || poke.added_by_role;

  if (status === 'pending_response') {
    return {
      status: 'pending_response',
      poke_activity_id: poke.id,
      poked_by_name: poke.poked_by_name,
      poked_by_role: poke.added_by_role,
      poked_by_label: who,
      poked_at: poke.created_at,
      label: `${who} requested an update — Awaiting Party A response`,
      short_label: `Update requested by ${who} · Pending`,
    };
  }

  const response = formatPokeResponsePayload(poke);

  return {
    status: 'awaiting_review',
    poke_activity_id: poke.id,
    poked_by_name: poke.poked_by_name,
    poked_by_role: poke.added_by_role,
    poked_by_label: who,
    poked_at: poke.created_at,
    answered_at: poke.response_submitted_at,
    answer_title: poke.response_title,
    party_a_response: response,
    label: `${who} requested an update — Party A response ready for review`,
    short_label: `Update requested by ${who} · Ready for review`,
  };
}

module.exports = { attachPokeStatus, buildPokeStatus, POKE_TITLE };

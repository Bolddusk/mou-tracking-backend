const pool = require('../config/db');

const POKE_TITLE = 'Update Requested';

const ROLE_LABELS = {
  sector_lead: 'Sector Lead',
  super_admin: 'Super Admin',
};

async function attachPokeStatus(proposals) {
  if (!proposals.length) return proposals;

  const ids = proposals.map((p) => p.id);

  const [pokes] = await pool.query(
    `SELECT a.proposal_id, a.id, a.added_by_role, a.created_at,
            a.response_submitted_at, a.response_title, u.full_name AS poked_by_name
     FROM proposal_activities a
     JOIN users u ON u.id = a.added_by
     WHERE a.proposal_id IN (?) AND a.title = ?
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

    if (poke.response_submitted_at) {
      return {
        ...proposal,
        poke_status: buildPokeStatus('answered', poke),
      };
    }

    return {
      ...proposal,
      poke_status: buildPokeStatus('pending_response', poke),
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

  return {
    status: 'answered',
    poke_activity_id: poke.id,
    poked_by_name: poke.poked_by_name,
    poked_by_role: poke.added_by_role,
    poked_by_label: who,
    poked_at: poke.created_at,
    answered_at: poke.response_submitted_at,
    answer_title: poke.response_title,
    label: `${who} requested an update — Response submitted`,
    short_label: `Update requested by ${who} · Answered`,
  };
}

module.exports = { attachPokeStatus, buildPokeStatus };

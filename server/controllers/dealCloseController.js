const pool = require('../config/db');
const { checkProposalAccess, buildProposalCapabilities } = require('../utils/proposalAccess');
const { enrichProposalRow } = require('../utils/proposalTemplate');
const {
  sectorLeadCoversSector,
  sectorLeadHasAnySector,
} = require('../utils/sectorLeadAssignments');
const {
  isProposalLocked,
  isMatchDealClosed,
  canCloseProposalDeal,
  canCloseMatchDeal,
} = require('../utils/dealClose');

const PROPOSAL_SELECT = `
  SELECT p.*,
    pa.full_name AS party_a_name,
    pa.email AS party_a_email,
    dcb.full_name AS deal_closed_by_name,
    dcb.email AS deal_closed_by_email
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
  LEFT JOIN users dcb ON dcb.id = p.deal_closed_by
`;

const MATCH_SELECT = `
  SELECT m.*,
    sa.sector,
    sa.submitted_by AS party_a_id,
    dcb.full_name AS deal_closed_by_name,
    dcb.email AS deal_closed_by_email
  FROM mm_matches m
  JOIN mm_proposals sa ON sa.id = m.side_a_proposal_id
  LEFT JOIN users dcb ON dcb.id = m.deal_closed_by
`;

async function getProposalRow(proposalId) {
  const [rows] = await pool.query(`${PROPOSAL_SELECT} WHERE p.id = ?`, [proposalId]);
  return rows[0] || null;
}

async function getMatchRow(matchId) {
  const [rows] = await pool.query(`${MATCH_SELECT} WHERE m.id = ?`, [matchId]);
  return rows[0] || null;
}

async function closeProposalDeal(req, res) {
  try {
    if (!['sector_lead', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const proposal = await getProposalRow(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (req.user.role === 'sector_lead') {
      if (!sectorLeadHasAnySector(req.user)) {
        return res.status(400).json({ error: 'Sector lead profile has no sector assigned' });
      }
      if (!sectorLeadCoversSector(req.user, proposal.sector)) {
        return res.status(403).json({ error: 'Access denied — wrong sector' });
      }
    }

    if (isProposalLocked(proposal)) {
      return res.status(400).json({ error: 'Deal is already closed' });
    }

    if (proposal.mou_status !== 'signed') {
      return res.status(400).json({
        error: 'MOU must be signed by both parties before closing deal',
      });
    }

    await pool.query(
      `UPDATE proposals
       SET status = 'completed',
           mou_status = 'deal_closed',
           deal_closed_at = NOW(),
           deal_closed_by = ?
       WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    const updated = await getProposalRow(req.params.id);
    const access = await checkProposalAccess(req, updated);
    return res.json({
      message: 'Deal closed successfully',
      proposal: enrichProposalRow(updated),
      capabilities: buildProposalCapabilities(req, updated, access),
    });
  } catch (err) {
    console.error('Close proposal deal error:', err.message);
    return res.status(500).json({ error: 'Failed to close deal' });
  }
}

async function closeMatchDeal(req, res) {
  try {
    if (!['sector_lead', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const match = await getMatchRow(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (isMatchDealClosed(match)) {
      return res.status(400).json({ error: 'Deal is already closed' });
    }

    if (match.mou_status !== 'signed') {
      return res.status(400).json({
        error: 'MOU must be signed by both parties before closing deal',
      });
    }

    if (!canCloseMatchDeal(req, match)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      `UPDATE mm_matches
       SET mou_status = 'deal_closed',
           deal_closed_at = NOW(),
           deal_closed_by = ?
       WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    const updated = await getMatchRow(req.params.id);
    return res.json({
      message: 'Deal closed successfully',
      match: {
        ...updated,
        side_a_proposal_id: Number(updated.side_a_proposal_id),
        side_b_proposal_id: Number(updated.side_b_proposal_id),
        engagement_proposal_id: updated.engagement_proposal_id
          ? Number(updated.engagement_proposal_id)
          : null,
      },
      can_close_deal: canCloseMatchDeal(req, updated),
    });
  } catch (err) {
    console.error('Close match deal error:', err.message);
    return res.status(500).json({ error: 'Failed to close deal' });
  }
}

module.exports = {
  closeProposalDeal,
  closeMatchDeal,
};

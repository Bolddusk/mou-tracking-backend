const PROPOSAL_LOCKED_ERROR = 'This deal is closed — no further edits allowed';
const MATCH_DEAL_CLOSED_ERROR = 'This deal is closed — no further edits allowed';

function isProposalLocked(proposal) {
  if (!proposal) return false;
  return proposal.status === 'completed' || proposal.mou_status === 'deal_closed';
}

function isMatchDealClosed(match) {
  if (!match) return false;
  return match.mou_status === 'deal_closed';
}

function canCloseProposalDeal(req, proposal) {
  if (!proposal || proposal.mou_status !== 'signed' || proposal.status === 'completed') {
    return false;
  }
  if (req.user.role === 'super_admin') return true;
  if (req.user.role === 'sector_lead') {
    return Boolean(req.user.sector) && proposal.sector === req.user.sector;
  }
  return false;
}

function canCloseMatchDeal(req, match) {
  if (!match || match.mou_status !== 'signed') {
    return false;
  }
  if (req.user.role === 'super_admin') return true;
  if (req.user.role === 'sector_lead') {
    if (!req.user.sector) return false;
    return match.sector === req.user.sector || match.matched_by === req.user.id;
  }
  return false;
}

module.exports = {
  PROPOSAL_LOCKED_ERROR,
  MATCH_DEAL_CLOSED_ERROR,
  isProposalLocked,
  isMatchDealClosed,
  canCloseProposalDeal,
  canCloseMatchDeal,
};

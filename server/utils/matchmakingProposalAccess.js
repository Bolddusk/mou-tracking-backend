const pool = require('../config/db');

const REVIEWER_ROLES = new Set(['focal_point', 'regional_focal_point', 'sector_lead']);
const SUBMITTER_ROLES = new Set(['party_a', 'investor']);

async function getUserCountry(userId) {
  const [rows] = await pool.query('SELECT country FROM users WHERE id = ?', [userId]);
  return rows[0]?.country || null;
}

async function getMmProposalById(proposalId) {
  const [rows] = await pool.query('SELECT * FROM mm_proposals WHERE id = ?', [proposalId]);
  return rows[0] || null;
}

async function getMmProposalForSubmitter(proposalId, user) {
  const proposal = await getMmProposalById(proposalId);
  if (!proposal) return null;
  if (user.role === 'super_admin') return proposal;
  if (proposal.submitted_by === user.id) return proposal;
  return null;
}

function isReviewerRole(role) {
  return REVIEWER_ROLES.has(role);
}

function countriesMatch(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

async function canReviewProposalInCountry(req, proposal) {
  if (!proposal) return false;
  if (req.user.role === 'super_admin') return true;
  if (!isReviewerRole(req.user.role)) return false;
  const country = req.user.country || (await getUserCountry(req.user.id));
  if (!country) return false;
  return countriesMatch(proposal.country, country);
}

function expectedSideForRole(role) {
  if (role === 'party_a') return 'side_a';
  if (role === 'investor') return 'side_b';
  return null;
}

async function canViewMmProposal(req, proposal) {
  if (!proposal) return false;
  if (req.user.role === 'super_admin') return true;
  if (proposal.submitted_by === req.user.id) return true;
  if (proposal.forwarded_to === req.user.id) return true;
  return canReviewProposalInCountry(req, proposal);
}

module.exports = {
  REVIEWER_ROLES,
  SUBMITTER_ROLES,
  getUserCountry,
  getMmProposalById,
  getMmProposalForSubmitter,
  isReviewerRole,
  canReviewProposalInCountry,
  canViewMmProposal,
  expectedSideForRole,
};

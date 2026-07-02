const MOU_LIFECYCLE_FILTERS = ['active', 'inactive', 'execution'];

const MOU_LIFECYCLE_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  execution: 'Execution',
};

/** SQL: proposal is in execution (contract / deal closed). */
const EXECUTION_SQL = `(
  p.mou_status = 'deal_closed'
  OR p.status = 'completed'
  OR p.cooperation_mode = 'agreement'
  OR p.deal_closed_at IS NOT NULL
)`;

/** SQL: collaboration marked dropped / inactive in imported or edited data. */
const INACTIVE_SQL = `(
  LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.collaboration_dropped')), '')) IN ('true', '1')
  OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.current_status')), '')) LIKE '%dropped%'
  OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.current_status')), '')) LIKE '%inactive%'
  OR LOWER(COALESCE(p.proposal_description, '')) LIKE '%collaboration status: dropped%'
)`;

function isCollaborationDropped(executiveSummary, proposalDescription = '') {
  if (!executiveSummary || typeof executiveSummary !== 'object') {
    return /collaboration status:\s*dropped/i.test(proposalDescription || '');
  }
  if (executiveSummary.collaboration_dropped === true || executiveSummary.collaboration_dropped === 1) {
    return true;
  }
  const status = String(executiveSummary.current_status || '').toLowerCase();
  if (status.includes('dropped') || status.includes('inactive')) {
    return true;
  }
  return /collaboration status:\s*dropped/i.test(proposalDescription || '');
}

function isExecutionPhase(proposal) {
  if (!proposal) return false;
  return (
    proposal.mou_status === 'deal_closed' ||
    proposal.status === 'completed' ||
    proposal.cooperation_mode === 'agreement' ||
    Boolean(proposal.deal_closed_at)
  );
}

function resolveMouLifecycle(proposal) {
  if (isExecutionPhase(proposal)) return 'execution';

  const executiveSummary =
    typeof proposal.executive_summary === 'object'
      ? proposal.executive_summary
      : null;

  if (isCollaborationDropped(executiveSummary, proposal.proposal_description)) {
    return 'inactive';
  }

  return 'active';
}

function buildMouLifecycleWhere(lifecycle) {
  if (!lifecycle) return null;

  if (lifecycle === 'execution') {
    return { sql: EXECUTION_SQL, params: [] };
  }
  if (lifecycle === 'inactive') {
    return { sql: `(${INACTIVE_SQL} AND NOT ${EXECUTION_SQL})`, params: [] };
  }
  if (lifecycle === 'active') {
    return { sql: `(NOT ${INACTIVE_SQL} AND NOT ${EXECUTION_SQL})`, params: [] };
  }

  return null;
}

function isValidMouLifecycleFilter(value) {
  return MOU_LIFECYCLE_FILTERS.includes(value);
}

module.exports = {
  MOU_LIFECYCLE_FILTERS,
  MOU_LIFECYCLE_LABELS,
  EXECUTION_SQL,
  INACTIVE_SQL,
  isCollaborationDropped,
  isExecutionPhase,
  resolveMouLifecycle,
  buildMouLifecycleWhere,
  isValidMouLifecycleFilter,
};

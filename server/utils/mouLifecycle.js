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
  OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.mou_operational_status')), '')) LIKE '%execution%'
)`;

/** SQL: collaboration marked dropped / inactive in imported or edited data. */
const INACTIVE_SQL = `(
  LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.collaboration_dropped')), '')) IN ('true', '1')
  OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.mou_operational_status')), '')) = 'inactive'
  OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.current_status')), '')) LIKE '%dropped%'
  OR LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.current_status')), '')) LIKE '%inactive%'
  OR LOWER(COALESCE(p.proposal_description, '')) LIKE '%collaboration status: dropped%'
  OR LOWER(COALESCE(p.proposal_description, '')) LIKE '%collaboration status: inactive%'
)`;

function isCollaborationDropped(executiveSummary, proposalDescription = '') {
  if (!executiveSummary || typeof executiveSummary !== 'object') {
    return (
      /collaboration status:\s*dropped/i.test(proposalDescription || '') ||
      /collaboration status:\s*inactive/i.test(proposalDescription || '')
    );
  }
  if (executiveSummary.collaboration_dropped === true || executiveSummary.collaboration_dropped === 1) {
    return true;
  }
  const operationalStatus = String(executiveSummary.mou_operational_status || '').toLowerCase();
  if (operationalStatus === 'inactive') {
    return true;
  }
  const status = String(executiveSummary.current_status || '').toLowerCase();
  if (status.includes('dropped') || status.includes('inactive')) {
    return true;
  }
  return (
    /collaboration status:\s*dropped/i.test(proposalDescription || '') ||
    /collaboration status:\s*inactive/i.test(proposalDescription || '')
  );
}

function isImportedExecutionStatus(executiveSummary) {
  const status = String(executiveSummary?.mou_operational_status || '').toLowerCase();
  return status.includes('execution');
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

  if (isImportedExecutionStatus(executiveSummary)) return 'execution';

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

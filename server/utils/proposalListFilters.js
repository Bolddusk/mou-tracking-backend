const {
  COOPERATION_MODES,
  COOPERATION_MODE_LABELS,
} = require('../constants/cooperationModes');
const { getActiveSectorNames } = require('./sectorRegistry');

const PROPOSAL_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'resubmitted', 'completed'];
const MOU_STATUSES = ['not_started', 'in_progress', 'uploaded', 'signed', 'deal_closed'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const PROPOSAL_LIST_FROM_SQL = `
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
  LEFT JOIN users rv ON rv.id = p.reviewed_by
`;

const RESOLVED_MOU_STATUS_SQL = `COALESCE(
  NULLIF(p.mou_status, 'not_started'),
  CASE
    WHEN p.mou_file_url IS NOT NULL AND p.mou_file_url != '' THEN 'uploaded'
    WHEN p.mou_scope IS NOT NULL AND p.mou_scope != '' THEN 'in_progress'
    ELSE 'not_started'
  END
)`;

function parseBoolParam(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function validateProposalListQuery(query, activeSectors = getActiveSectorNames()) {
  const errors = [];

  if (query.status && !PROPOSAL_STATUSES.includes(query.status)) {
    errors.push('Invalid status filter');
  }
  if (query.sector && !activeSectors.includes(query.sector)) {
    errors.push('Invalid sector filter');
  }
  if (query.mou_status && !MOU_STATUSES.includes(query.mou_status)) {
    errors.push('Invalid mou_status filter');
  }
  if (query.cooperation_mode && !COOPERATION_MODES.includes(query.cooperation_mode)) {
    errors.push('Invalid cooperation_mode filter');
  }
  if (query.conference_key && String(query.conference_key).trim().length > 80) {
    errors.push('Invalid conference_key filter');
  }
  if (query.date_from && !isValidDate(query.date_from)) {
    errors.push('Invalid date_from — use YYYY-MM-DD');
  }
  if (query.date_to && !isValidDate(query.date_to)) {
    errors.push('Invalid date_to — use YYYY-MM-DD');
  }

  for (const key of ['has_mou', 'has_pitch', 'deal_closed']) {
    if (query[key] !== undefined && query[key] !== '' && parseBoolParam(query[key]) === null) {
      errors.push(`Invalid ${key} filter — use true or false`);
    }
  }

  return errors;
}

function buildProposalListWhere(query) {
  const conditions = [];
  const params = [];

  if (query.status) {
    conditions.push('p.status = ?');
    params.push(query.status);
  }

  if (query.sector) {
    conditions.push('p.sector = ?');
    params.push(query.sector);
  }

  if (query.mou_status) {
    conditions.push(`${RESOLVED_MOU_STATUS_SQL} = ?`);
    params.push(query.mou_status);
  }

  if (query.cooperation_mode) {
    conditions.push('p.cooperation_mode = ?');
    params.push(query.cooperation_mode);
  }

  if (query.conference_key) {
    conditions.push('p.conference_key = ?');
    params.push(String(query.conference_key).trim());
  }

  if (query.q && String(query.q).trim()) {
    const term = `%${String(query.q).trim()}%`;
    conditions.push(`(
      p.proposal_title LIKE ?
      OR p.venture_name LIKE ?
      OR p.company_name LIKE ?
      OR pa.full_name LIKE ?
      OR pa.organization LIKE ?
      OR p.party_b_name LIKE ?
      OR p.party_b_organization LIKE ?
      OR p.sector LIKE ?
      OR p.mou_sub_sector LIKE ?
      OR p.jurisdiction LIKE ?
      OR p.conference_name LIKE ?
    )`);
    params.push(term, term, term, term, term, term, term, term, term, term, term);
  }

  if (query.date_from) {
    conditions.push('DATE(p.created_at) >= ?');
    params.push(query.date_from);
  }

  if (query.date_to) {
    conditions.push('DATE(p.created_at) <= ?');
    params.push(query.date_to);
  }

  const hasMou = parseBoolParam(query.has_mou);
  if (hasMou === true) {
    conditions.push("(p.mou_file_url IS NOT NULL AND p.mou_file_url != '')");
  } else if (hasMou === false) {
    conditions.push("(p.mou_file_url IS NULL OR p.mou_file_url = '')");
  }

  const hasPitch = parseBoolParam(query.has_pitch);
  if (hasPitch === true) {
    conditions.push("(p.proposal_file_url IS NOT NULL AND p.proposal_file_url != '')");
  } else if (hasPitch === false) {
    conditions.push("(p.proposal_file_url IS NULL OR p.proposal_file_url = '')");
  }

  const dealClosed = parseBoolParam(query.deal_closed);
  if (dealClosed === true) {
    conditions.push("(p.mou_status = 'deal_closed' OR p.status = 'completed')");
  } else if (dealClosed === false) {
    conditions.push("(COALESCE(p.mou_status, 'not_started') != 'deal_closed' AND p.status != 'completed')");
  }

  if (!conditions.length) {
    return { sql: '', params };
  }

  return {
    sql: ` WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

module.exports = {
  PROPOSAL_STATUSES,
  MOU_STATUSES,
  COOPERATION_MODES,
  COOPERATION_MODE_LABELS,
  getActiveSectorNames,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PROPOSAL_LIST_FROM_SQL,
  parsePagination,
  validateProposalListQuery,
  buildProposalListWhere,
};

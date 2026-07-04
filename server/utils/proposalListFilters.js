const {
  COOPERATION_MODES,
  COOPERATION_MODE_LABELS,
} = require('../constants/cooperationModes');
const { getActiveSectorNames } = require('./sectorRegistry');
const { getActiveSifcCategoryNames } = require('./sifcCategoryRegistry');
const {
  MOU_LIFECYCLE_FILTERS,
  buildMouLifecycleWhere,
  isValidMouLifecycleFilter,
} = require('./mouLifecycle');

const PROPOSAL_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'resubmitted', 'completed'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const PROPOSAL_LIST_FROM_SQL = `
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
  LEFT JOIN users rv ON rv.id = p.reviewed_by
`;

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

function validateProposalListQuery(query, activeSectors = getActiveSectorNames(), options = {}) {
  const errors = [];

  if (query.status && !PROPOSAL_STATUSES.includes(query.status)) {
    errors.push('Invalid status filter');
  }
  if (!options.ignoreSectorFilter && query.sector && !activeSectors.includes(query.sector)) {
    errors.push('Invalid sector filter');
  }
  if (query.mou_lifecycle && !isValidMouLifecycleFilter(query.mou_lifecycle)) {
    errors.push('Invalid mou_lifecycle filter — use active, inactive, or execution');
  }
  if (query.cooperation_mode && !COOPERATION_MODES.includes(query.cooperation_mode)) {
    errors.push('Invalid cooperation_mode filter');
  }
  if (query.conference_key && String(query.conference_key).trim().length > 80) {
    errors.push('Invalid conference_key filter');
  }
  if (query.sifc_category) {
    const activeSifc = getActiveSifcCategoryNames();
    if (!activeSifc.includes(String(query.sifc_category).trim())) {
      errors.push('Invalid sifc_category filter');
    }
  }
  if (query.date_from && !isValidDate(query.date_from)) {
    errors.push('Invalid date_from — use YYYY-MM-DD');
  }
  if (query.date_to && !isValidDate(query.date_to)) {
    errors.push('Invalid date_to — use YYYY-MM-DD');
  }

  return errors;
}

function buildProposalListWhere(query, options = {}) {
  const conditions = [];
  const params = [];
  const scopedSectors =
    options.sectorScopes?.length > 0
      ? options.sectorScopes
      : options.sectorScope
        ? [options.sectorScope]
        : null;

  if (scopedSectors?.length) {
    conditions.push(`p.sector IN (${scopedSectors.map(() => '?').join(', ')})`);
    params.push(...scopedSectors);
    conditions.push("p.status != 'draft'");
  }

  if (query.status) {
    conditions.push('p.status = ?');
    params.push(query.status);
  }

  if (!scopedSectors?.length && query.sector) {
    conditions.push('p.sector = ?');
    params.push(query.sector);
  }

  if (query.mou_lifecycle) {
    const lifecycleWhere = buildMouLifecycleWhere(query.mou_lifecycle);
    if (lifecycleWhere) {
      conditions.push(lifecycleWhere.sql);
      params.push(...lifecycleWhere.params);
    }
  }

  if (query.cooperation_mode) {
    conditions.push('p.cooperation_mode = ?');
    params.push(query.cooperation_mode);
  }

  if (query.conference_key) {
    conditions.push('p.conference_key = ?');
    params.push(String(query.conference_key).trim());
  }

  if (query.sifc_category) {
    conditions.push(
      `JSON_UNQUOTE(JSON_EXTRACT(p.executive_summary, '$.sifc_category')) = ?`
    );
    params.push(String(query.sifc_category).trim());
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

  if (!conditions.length) {
    return { sql: '', params };
  }

  return {
    sql: ` WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

function buildListFiltersEcho(query, options = {}) {
  const scopedSectors =
    options.sectorScopes?.length > 0
      ? options.sectorScopes
      : options.sectorScope
        ? [options.sectorScope]
        : null;

  return {
    conference_key: query.conference_key || null,
    sifc_category: query.sifc_category || null,
    cooperation_mode: query.cooperation_mode || null,
    status: query.status || null,
    sector: scopedSectors?.length === 1 ? scopedSectors[0] : query.sector || null,
    sectors: scopedSectors?.length > 1 ? scopedSectors : null,
    mou_lifecycle: query.mou_lifecycle || null,
    q: query.q || null,
    date_from: query.date_from || null,
    date_to: query.date_to || null,
  };
}

module.exports = {
  PROPOSAL_STATUSES,
  MOU_LIFECYCLE_FILTERS,
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
  buildListFiltersEcho,
};

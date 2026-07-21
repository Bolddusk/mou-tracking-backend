const {
  COOPERATION_MODES,
  COOPERATION_MODE_LABELS,
} = require('../constants/cooperationModes');
const { getActiveSectorNames } = require('./sectorRegistry');
const { getActiveSifcCategoryNames } = require('./sifcCategoryRegistry');
const { buildNotArchivedSql } = require('./proposalSoftDelete');
const {
  MOU_LIFECYCLE_FILTERS,
  buildMouLifecycleWhere,
  isValidMouLifecycleFilter,
  EXECUTION_SQL,
  INACTIVE_SQL,
  MOU_LIFECYCLE_LABELS,
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

  const archiveFilter = String(query.archive_filter || query.archive || '').trim().toLowerCase();
  const archivedOnly =
    query.archived_only === '1' ||
    query.archived_only === 'true' ||
    archiveFilter === 'archived_only' ||
    archiveFilter === 'archived';
  const includeDeleted =
    query.include_deleted === '1' ||
    query.include_deleted === 'true' ||
    archiveFilter === 'include_archived' ||
    archiveFilter === 'all';
  const canUseArchiveFilters = Boolean(options.allowIncludeDeleted);

  if (archivedOnly && canUseArchiveFilters) {
    conditions.push('p.deleted_at IS NOT NULL');
  } else if (includeDeleted && canUseArchiveFilters) {
    // Active + archived — no deleted_at filter
  } else {
    conditions.push(buildNotArchivedSql('p'));
  }

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

  if (options.ministryId) {
    conditions.push('p.ministry_id = ?');
    params.push(Number(options.ministryId));
  } else if (query.ministry_id) {
    conditions.push('p.ministry_id = ?');
    params.push(Number(query.ministry_id));
  }

  if (!conditions.length) {
    return { sql: '', params };
  }

  return {
    sql: ` WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

const DASHBOARD_LIST_TAB_FILTERS = [
  { key: 'all', label: 'All', query: {} },
  ...MOU_LIFECYCLE_FILTERS.map((value) => ({
    key: value,
    label: MOU_LIFECYCLE_LABELS[value],
    query: { mou_lifecycle: value },
  })),
];

async function fetchMouLifecycleSummaryCounts(pool, query = {}, options = {}) {
  const countQuery = { ...query };
  delete countQuery.mou_lifecycle;
  delete countQuery.status;
  delete countQuery.page;
  delete countQuery.limit;

  const { sql, params } = buildProposalListWhere(countQuery, options);

  // Dashboard Total / Active / Inactive / Execution — only approved (or completed) MOUs
  const approvedOnly = "p.status IN ('approved', 'completed')";
  const whereSql = sql
    ? `${sql} AND ${approvedOnly}`
    : ` WHERE ${approvedOnly}`;

  const [[row]] = await pool.query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN NOT (${INACTIVE_SQL}) AND NOT (${EXECUTION_SQL}) THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN (${INACTIVE_SQL}) AND NOT (${EXECUTION_SQL}) THEN 1 ELSE 0 END) AS inactive,
      SUM(CASE WHEN (${EXECUTION_SQL}) THEN 1 ELSE 0 END) AS execution
     ${PROPOSAL_LIST_FROM_SQL}${whereSql}`,
    params
  );

  return {
    all: Number(row.total) || 0,
    active: Number(row.active) || 0,
    inactive: Number(row.inactive) || 0,
    execution: Number(row.execution) || 0,
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
    ministry_id: options.ministryId || query.ministry_id || null,
    mou_lifecycle: query.mou_lifecycle || null,
    q: query.q || null,
    date_from: query.date_from || null,
    date_to: query.date_to || null,
    include_deleted: query.include_deleted === '1' || query.include_deleted === 'true' || null,
    archived_only: query.archived_only === '1' || query.archived_only === 'true' || null,
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
  fetchMouLifecycleSummaryCounts,
  DASHBOARD_LIST_TAB_FILTERS,
};

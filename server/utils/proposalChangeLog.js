const pool = require('../config/db');
const { enrichProposalRow, parseJsonField } = require('./proposalTemplate');
const {
  MOU_LIFECYCLE_FILTERS,
  MOU_LIFECYCLE_LABELS,
  buildMouLifecycleWhere,
  isValidMouLifecycleFilter,
  resolveMouLifecycle,
} = require('./mouLifecycle');

const JSON_DB_FIELDS = new Set([
  'conference_info',
  'party_a_info',
  'party_b_info',
  'executive_summary',
  'company_overview',
  'project_overview',
  'financials',
  'investment_ask',
  'contact_info',
]);

const FIELD_LABELS = {
  status: 'Status',
  sector: 'Sector',
  company_name: 'Pakistani Company',
  venture_name: 'Venture Name',
  proposal_title: 'Title',
  proposal_description: 'Outcome / Description',
  cooperation_mode: 'Cooperation Mode',
  conference_key: 'Conference',
  conference_name: 'Conference Name',
  investment_value_usd: 'MOU Value (USD M)',
  mou_sub_sector: 'MOU Sub-sector',
  jurisdiction: 'Jurisdiction',
  signed_copy_status: 'Signed Copy Status',
  mou_status: 'MOU Status',
  mou_scope: 'MOU Scope',
  mou_description: 'MOU Description',
  mou_sector: 'MOU Sector',
  mou_demand: 'MOU Demand',
  mou_file_url: 'MOU File',
  external_reference: 'External Reference',
  sector_lead_comment: 'Sector Lead Comment',
  party_b_name: 'Chinese Company Contact',
  party_b_organization: 'Chinese Organization',
  party_b_email: 'Chinese Company Email',
  party_b_phone: 'Chinese Company Phone',
  party_b_country: 'Chinese Company Country',
  engagement_type: 'Engagement Type',
  project_type: 'Project Type',
  reviewed_by: 'Reviewed By (user id)',
  deal_closed_at: 'Deal Closed At',
  deal_closed_by: 'Deal Closed By (user id)',
  mou_ack_by_a: 'MOU Acknowledged by Pakistani Side',
  mou_ack_by_b: 'MOU Acknowledged by Chinese Side',
  'party_a_info.entity_type': 'Pakistani Entity Type',
  'party_a_info.organization_name': 'Pakistani Organization',
  'party_a_info.contact_name': 'Pakistani Contact Name',
  'party_a_info.designation': 'Pakistani Designation',
  'party_a_info.email': 'Pakistani Email',
  'party_a_info.phone': 'Pakistani Phone',
  'party_a_info.country': 'Pakistani Country',
  'party_a_info.city': 'Pakistani City',
  'party_b_info.entity_type': 'Chinese Entity Type',
  'party_b_info.organization_name': 'Chinese Organization',
  'party_b_info.department_ministry': 'Chinese Department / Ministry',
  'party_b_info.contact_name': 'Chinese Contact Name',
  'party_b_info.designation': 'Chinese Designation',
  'party_b_info.email': 'Chinese Email',
  'party_b_info.phone': 'Chinese Phone',
  'party_b_info.country': 'Chinese Country',
  'party_b_info.city': 'Chinese City',
  'executive_summary.sifc_category': 'SIFC Category',
  'executive_summary.mou_operational_status': 'Operational Status',
  'executive_summary.progress': 'Progress',
  'executive_summary.bottlenecks': 'Bottleneck',
  'executive_summary.tentative_timeline': 'Tentative Timeline',
  'executive_summary.project_overview': 'Project Overview',
  'executive_summary.current_status': 'Current Status',
  'executive_summary.action_taken': 'Action Taken',
  'executive_summary.location': 'Location',
};

const ACTION_LABELS = {
  created: 'Proposal created',
  draft_saved: 'Draft saved',
  submitted: 'Submitted for review',
  resubmitted: 'Resubmitted for review',
  fields_updated: 'MOU fields updated',
  party_contacts_updated: 'Party contacts updated',
  mou_updated: 'MOU updated',
  mou_file_uploaded: 'MOU file uploaded',
  mou_acknowledged: 'MOU acknowledged',
  approved: 'Approved by sector lead',
  rejected: 'Rejected by sector lead',
  deal_closed: 'Deal closed',
};

function serializeValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 2000 ? `${text.slice(0, 1997)}...` : text;
  }
  const text = String(value).trim();
  return text.length > 2000 ? `${text.slice(0, 1997)}...` : text;
}

function labelForField(fieldPath) {
  return FIELD_LABELS[fieldPath] || fieldPath.replace(/_/g, ' ').replace(/\./g, ' › ');
}

function parseStoredJson(raw, fallback = {}) {
  if (raw === null || raw === undefined) return { ...fallback };
  if (typeof raw === 'object') return { ...raw };
  return parseJsonField(raw, fallback);
}

function diffJsonObjects(before, after, prefix) {
  const changes = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  keys.forEach((key) => {
    const path = `${prefix}.${key}`;
    const oldStr = serializeValue(before?.[key]);
    const newStr = serializeValue(after?.[key]);
    if (oldStr !== newStr) {
      changes.push({
        field: path,
        label: labelForField(path),
        old_value: oldStr,
        new_value: newStr,
      });
    }
  });

  return changes;
}

/** proposal_title / conference_name are system-synced — not separate user edits. */
function suppressAutoSyncedFieldChanges(updates, changes) {
  if (!changes.length) return changes;

  const skip = new Set();

  if (updates.company_name !== undefined || updates.venture_name !== undefined) {
    skip.add('proposal_title');
  }

  if (updates.conference_key !== undefined) {
    skip.add('conference_name');
    changes
      .filter((change) => change.field.startsWith('conference_info.'))
      .forEach((change) => skip.add(change.field));
  }

  if (updates.party_b_info !== undefined) {
    [
      'party_b_entity_type',
      'party_b_name',
      'party_b_organization',
      'party_b_email',
      'party_b_phone',
      'party_b_country',
    ].forEach((field) => skip.add(field));
  }

  if (updates.party_a_info !== undefined) {
    skip.add('company_name');
  }

  const filtered = changes.filter((change) => !skip.has(change.field));

  if (updates.conference_key !== undefined) {
    const keyChange = changes.find((change) => change.field === 'conference_key');
    const nameChange = changes.find((change) => change.field === 'conference_name');
    if (!keyChange && nameChange) {
      filtered.push({
        field: 'conference_key',
        label: labelForField('conference_key'),
        old_value: nameChange.old_value,
        new_value: nameChange.new_value,
      });
    }
  }

  return filtered;
}

function buildChangeDiff(beforeRow, updates) {
  if (!beforeRow || !updates || !Object.keys(updates).length) return [];

  const before = enrichProposalRow(beforeRow);
  const changes = [];

  Object.entries(updates).forEach(([field, rawNew]) => {
    if (JSON_DB_FIELDS.has(field)) {
      const oldObj = before[field] || parseStoredJson(beforeRow[field], {});
      const newObj =
        typeof rawNew === 'string' ? parseStoredJson(rawNew, {}) : { ...(rawNew || {}) };
      changes.push(...diffJsonObjects(oldObj, newObj, field));
      return;
    }

    const oldStr = serializeValue(before[field] ?? beforeRow[field]);
    const newStr = serializeValue(rawNew);
    if (oldStr !== newStr) {
      changes.push({
        field,
        label: labelForField(field),
        old_value: oldStr,
        new_value: newStr,
      });
    }
  });

  return suppressAutoSyncedFieldChanges(updates, changes);
}

function buildManualChanges(entries) {
  return entries
    .filter((item) => serializeValue(item.old_value) !== serializeValue(item.new_value))
    .map((item) => ({
      field: item.field,
      label: labelForField(item.field),
      old_value: serializeValue(item.old_value),
      new_value: serializeValue(item.new_value),
    }));
}

function formatUserName(user) {
  return String(user?.full_name || user?.email || `User #${user?.id || '?'}`).trim();
}

async function recordProposalChangeLog({
  proposalId,
  user,
  action,
  changes = [],
  summary = null,
  connection = null,
}) {
  if (!proposalId || !user?.id) return null;

  const normalizedChanges = Array.isArray(changes) ? changes : [];
  if (!normalizedChanges.length && !summary) return null;

  try {
    const q = connection ? connection.query.bind(connection) : pool.query.bind(pool);
    const actionLabel = ACTION_LABELS[action] || action;
    const fieldSummary = normalizedChanges.map((c) => c.label || labelForField(c.field)).join(', ');
    const finalSummary =
      summary ||
      (normalizedChanges.length
        ? `${actionLabel} — ${fieldSummary}`
        : actionLabel);

    const [result] = await q(
      `INSERT INTO proposal_change_logs
        (proposal_id, changed_by, changed_by_role, changed_by_name, action, summary, changes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        proposalId,
        user.id,
        user.role,
        formatUserName(user),
        action,
        finalSummary,
        JSON.stringify(normalizedChanges),
      ]
    );

    return result.insertId;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      console.warn('proposal_change_logs missing — run: npm run db:migrate:proposal-change-logs');
      return null;
    }
    console.error('Failed to record proposal change log:', err.message);
    return null;
  }
}

async function logProposalUpdates({
  proposalId,
  user,
  action,
  beforeRow,
  updates,
  summary,
  connection,
}) {
  const changes = buildChangeDiff(beforeRow, updates);
  if (!changes.length) return null;
  return recordProposalChangeLog({
    proposalId,
    user,
    action,
    changes,
    summary,
    connection,
  });
}

async function logProposalAction({
  proposalId,
  user,
  action,
  changes,
  summary,
  connection,
}) {
  const normalized = buildManualChanges(changes || []);
  return recordProposalChangeLog({
    proposalId,
    user,
    action,
    changes: normalized,
    summary: summary || ACTION_LABELS[action] || action,
    connection,
  });
}

function parseChangesColumn(raw) {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    const values = Object.values(raw);
    if (values.length && values.every((item) => item && typeof item === 'object')) {
      return values;
    }
    return [];
  }
  const parsed = parseJsonField(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

function formatChangeDisplay(change) {
  const label = change.label || labelForField(change.field);
  const oldVal = change.old_value ?? '—';
  const newVal = change.new_value ?? '—';
  return `${label}: ${oldVal} → ${newVal}`;
}

function normalizeChangeEntries(rawChanges) {
  return parseChangesColumn(rawChanges)
    .map((change) => {
      const label = change.label || labelForField(change.field);
      const oldValue = change.old_value ?? null;
      const newValue = change.new_value ?? null;
      return {
        field: change.field,
        label,
        old_value: oldValue,
        new_value: newValue,
        display: formatChangeDisplay({ ...change, label, old_value: oldValue, new_value: newValue }),
      };
    })
    .filter((change) => change.field || change.label);
}

function buildProposalLabel(row) {
  const pak = String(row.company_name || row.party_a_name || '').trim();
  const chinese = String(row.venture_name || row.party_b_name || '').trim();
  if (pak && chinese) return `${pak} / ${chinese}`;
  return pak || chinese || row.proposal_title || `MOU #${row.proposal_id || row.id}`;
}

function mapChangeLogRow(row) {
  const changes = normalizeChangeEntries(row.changes);
  return {
    id: row.id,
    proposal_id: row.proposal_id,
    changed_by: row.changed_by,
    changed_by_role: row.changed_by_role,
    changed_by_name: row.changed_by_name,
    action: row.action,
    action_label: ACTION_LABELS[row.action] || row.action,
    summary: row.summary,
    changes,
    change_count: changes.length,
    fields_changed: changes.map((c) => c.label),
    change_details: changes.map((c) => c.display),
    has_field_changes: changes.length > 0,
    created_at: row.created_at,
    proposal_label: row.proposal_label || null,
    proposal_status: row.proposal_status || null,
    proposal_sector: row.proposal_sector || null,
    mou_lifecycle: row.mou_lifecycle || null,
    mou_lifecycle_label: row.mou_lifecycle
      ? MOU_LIFECYCLE_LABELS[row.mou_lifecycle] || row.mou_lifecycle
      : null,
  };
}

async function listProposalChangeLogs(proposalId, { limit = 100, offset = 0, changedBy = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const where = ['proposal_id = ?'];
  const params = [proposalId];

  if (changedBy) {
    where.push('changed_by = ?');
    params.push(changedBy);
  }

  const whereSql = where.join(' AND ');

  const [rows] = await pool.query(
    `SELECT id, proposal_id, changed_by, changed_by_role, changed_by_name,
            action, summary, changes, created_at
     FROM proposal_change_logs
     WHERE ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM proposal_change_logs WHERE ${whereSql}`,
    params
  );

  return {
    logs: rows.map(mapChangeLogRow),
    total: Number(countRow.total) || 0,
  };
}

async function listMouOptionsForChangeLogs({ limit = 100, offset = 0, q = null } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const where = ["p.status != 'draft'"];
  const params = [];

  const search = String(q || '').trim();
  if (search) {
    const idSearch = /^\d+$/.test(search) ? Number(search) : null;
    if (idSearch) {
      where.push('p.id = ?');
      params.push(idSearch);
    } else {
      const like = `%${search}%`;
      where.push(
        '(p.company_name LIKE ? OR p.venture_name LIKE ? OR p.proposal_title LIKE ? OR p.party_b_name LIKE ?)'
      );
      params.push(like, like, like, like);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM proposals p ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.company_name,
       p.venture_name,
       p.proposal_title,
       p.party_b_name,
       p.status,
       pa.full_name AS party_a_name,
       (SELECT COUNT(*) FROM proposal_change_logs l WHERE l.proposal_id = p.id) AS log_count,
       (SELECT MAX(l.created_at) FROM proposal_change_logs l WHERE l.proposal_id = p.id) AS last_log_at
     FROM proposals p
     JOIN users pa ON pa.id = p.party_a_id
     ${whereSql}
     ORDER BY p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );

  return {
    options: rows.map((row) => ({
      ...row,
      log_count: Number(row.log_count) || 0,
    })),
    total: Number(countRow.total) || 0,
  };
}

const CHANGE_LOG_MOU_STATUSES = MOU_LIFECYCLE_FILTERS.map((value) => ({
  value,
  label: MOU_LIFECYCLE_LABELS[value],
}));

const CHANGE_LOG_CHANGED_BY_ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'sector_lead', label: 'Sector Lead' },
  { value: 'party_a', label: 'Party A' },
  { value: 'party_b', label: 'Party B' },
  { value: 'investor', label: 'Investor' },
];

const CHANGE_LOG_LIST_FROM = `
  FROM proposal_change_logs l
  JOIN proposals p ON p.id = l.proposal_id
  JOIN users pa ON pa.id = p.party_a_id
`;

const CHANGE_LOG_LIST_SELECT = `
  SELECT
    l.id,
    l.proposal_id,
    l.changed_by,
    l.changed_by_role,
    l.changed_by_name,
    l.action,
    l.summary,
    l.changes,
    l.created_at,
    p.status AS proposal_status,
    p.sector AS proposal_sector,
    p.mou_status,
    p.deal_closed_at,
    p.executive_summary,
    p.proposal_description,
    p.company_name,
    p.venture_name,
    p.proposal_title,
    p.party_b_name,
    pa.full_name AS party_a_name
`;

function parseDateBoundary(value, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return endOfDay ? `${raw} 23:59:59` : `${raw} 00:00:00`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function buildChangeLogFilterWhere(filters = {}) {
  const where = [];
  const params = [];

  if (filters.sectorScopes?.length) {
    where.push(`p.sector IN (${filters.sectorScopes.map(() => '?').join(', ')})`);
    params.push(...filters.sectorScopes);
  }

  if (filters.sector) {
    where.push('p.sector = ?');
    params.push(filters.sector);
  }

  if (filters.proposalId) {
    where.push('l.proposal_id = ?');
    params.push(Number(filters.proposalId));
  }

  if (filters.changedBy) {
    where.push('l.changed_by = ?');
    params.push(Number(filters.changedBy));
  }

  if (filters.sectorLeadId) {
    where.push('l.changed_by = ? AND l.changed_by_role = ?');
    params.push(Number(filters.sectorLeadId), 'sector_lead');
  }

  if (filters.changedByRole) {
    where.push('l.changed_by_role = ?');
    params.push(filters.changedByRole);
  }

  if (filters.mouStatus && isValidMouLifecycleFilter(filters.mouStatus)) {
    const lifecycleWhere = buildMouLifecycleWhere(filters.mouStatus);
    if (lifecycleWhere?.sql) {
      where.push(lifecycleWhere.sql);
      params.push(...(lifecycleWhere.params || []));
    }
  }

  const fromDate = parseDateBoundary(filters.from, false);
  if (fromDate) {
    where.push('l.created_at >= ?');
    params.push(fromDate);
  }

  const toDate = parseDateBoundary(filters.to, true);
  if (toDate) {
    where.push('l.created_at <= ?');
    params.push(toDate);
  }

  const search = String(filters.q || '').trim();
  if (search) {
    const idSearch = /^\d+$/.test(search) ? Number(search) : null;
    if (idSearch) {
      where.push('l.proposal_id = ?');
      params.push(idSearch);
    } else {
      const like = `%${search}%`;
      where.push(
        `(p.company_name LIKE ? OR p.venture_name LIKE ? OR p.proposal_title LIKE ?
          OR p.party_b_name LIKE ? OR l.changed_by_name LIKE ? OR l.summary LIKE ?
          OR p.sector LIKE ?)`
      );
      params.push(like, like, like, like, like, like, like);
    }
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

function mapChangeLogListRows(rows) {
  return rows.map((row) => {
    const lifecycle = resolveMouLifecycle({
      status: row.proposal_status,
      mou_status: row.mou_status,
      deal_closed_at: row.deal_closed_at,
      executive_summary: parseJsonField(row.executive_summary, {}),
      proposal_description: row.proposal_description,
    });
    return mapChangeLogRow({
      ...row,
      proposal_label: buildProposalLabel(row),
      proposal_status: row.proposal_status,
      proposal_sector: row.proposal_sector,
      mou_lifecycle: lifecycle,
    });
  });
}

async function listFilteredChangeLogs({ limit = 50, offset = 0, filters = {}, maxLimit = 200 } = {}) {
  const cap = Math.min(Math.max(Number(maxLimit) || 200, 1), 10000);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), cap);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const { whereSql, params } = buildChangeLogFilterWhere(filters);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total ${CHANGE_LOG_LIST_FROM} ${whereSql}`,
    params
  );

  const [rows] = await pool.query(
    `${CHANGE_LOG_LIST_SELECT}
     ${CHANGE_LOG_LIST_FROM}
     ${whereSql}
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, safeOffset]
  );

  return {
    logs: mapChangeLogListRows(rows),
    total: Number(countRow.total) || 0,
  };
}

async function getChangeLogFilterOptionsData({ sectorScopes = null } = {}) {
  const sectorLeadParams = [];
  let sectorLeadWhere = "WHERE u.role = 'sector_lead'";
  if (sectorScopes?.length) {
    sectorLeadWhere += ` AND EXISTS (
      SELECT 1 FROM sector_lead_assignments sla
      WHERE sla.user_id = u.id AND sla.sector IN (${sectorScopes.map(() => '?').join(', ')})
    )`;
    sectorLeadParams.push(...sectorScopes);
  }

  const [sectorLeads] = await pool.query(
    `SELECT u.id, u.full_name, u.email
     FROM users u
     ${sectorLeadWhere}
     ORDER BY u.full_name ASC`,
    sectorLeadParams
  );

  const leadIds = sectorLeads.map((row) => row.id);
  let assignmentsByUser = {};
  if (leadIds.length) {
    const [assignments] = await pool.query(
      `SELECT user_id, sector, is_primary
       FROM sector_lead_assignments
       WHERE user_id IN (${leadIds.map(() => '?').join(', ')})
       ORDER BY is_primary DESC, sector ASC`,
      leadIds
    );
    assignmentsByUser = assignments.reduce((acc, row) => {
      if (!acc[row.user_id]) acc[row.user_id] = [];
      acc[row.user_id].push(row.sector);
      return acc;
    }, {});
  }

  const sectors = sectorScopes?.length
    ? [...sectorScopes]
  : (
      await pool.query(
        `SELECT DISTINCT p.sector
         FROM proposals p
         INNER JOIN proposal_change_logs l ON l.proposal_id = p.id
         WHERE p.sector IS NOT NULL AND p.sector != ''
         ORDER BY p.sector ASC`
      )
    )[0].map((row) => row.sector);

  const [changers] = await pool.query(
    `SELECT DISTINCT l.changed_by_role AS role
     FROM proposal_change_logs l
     ORDER BY l.changed_by_role ASC`
  );

  return {
    sector_leads: sectorLeads.map((row) => ({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      sectors: assignmentsByUser[row.id] || [],
    })),
    sectors,
    mou_statuses: CHANGE_LOG_MOU_STATUSES,
    changed_by_roles: CHANGE_LOG_CHANGED_BY_ROLES.filter((item) =>
      changers.some((row) => row.role === item.value)
    ),
    scoped_sectors: sectorScopes?.length ? sectorScopes : null,
  };
}

async function listRecentChangeLogs(options = {}) {
  return listFilteredChangeLogs(options);
}

async function listSectorScopedChangeLogs(options = {}) {
  return listFilteredChangeLogs(options);
}

async function listUserChangeLogs(userId, options = {}) {
  const filters = {
    ...(options.filters || {}),
    changedBy: userId,
  };
  return listFilteredChangeLogs({
    limit: options.limit,
    offset: options.offset,
    filters,
  });
}

module.exports = {
  ACTION_LABELS,
  FIELD_LABELS,
  buildChangeDiff,
  buildManualChanges,
  normalizeChangeEntries,
  formatChangeDisplay,
  recordProposalChangeLog,
  logProposalUpdates,
  logProposalAction,
  listProposalChangeLogs,
  listMouOptionsForChangeLogs,
  listRecentChangeLogs,
  listSectorScopedChangeLogs,
  listFilteredChangeLogs,
  listUserChangeLogs,
  getChangeLogFilterOptionsData,
  buildChangeLogFilterWhere,
  CHANGE_LOG_MOU_STATUSES,
};

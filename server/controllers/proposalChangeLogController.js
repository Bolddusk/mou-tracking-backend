const pool = require('../config/db');
const { checkProposalAccess } = require('../utils/proposalAccess');
const { getSectorLeadScopedSectors } = require('../utils/sectorLeadAssignments');
const { isValidMouLifecycleFilter } = require('../utils/mouLifecycle');
const {
  changeLogsToCsv,
  changeLogsToXlsx,
  buildExportFilename,
  buildProposalExportFilename,
  hasActiveFilters,
} = require('../utils/changeLogReportFormats');
const {
  listProposalChangeLogs,
  listMouOptionsForChangeLogs,
  listFilteredChangeLogs,
  listUserChangeLogs,
  getChangeLogFilterOptionsData,
} = require('../utils/proposalChangeLog');

const EXPORT_MAX_ROWS = 10000;

function isChangeLogOversightRole(role) {
  return ['super_admin', 'admin'].includes(role);
}

function parseTruthy(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function parseChangeLogQuery(req) {
  const q = req.query;
  const rawMouStatus = String(q.mou_status || '').trim().toLowerCase();
  return {
    limit: q.limit,
    offset: q.offset,
    filters: {
      q: q.q || q.search || null,
      proposalId: q.proposal_id || q.mou_id || null,
      sectorLeadId: q.sector_lead_id || null,
      changedBy: q.changed_by || null,
      changedByRole: q.changed_by_role || q.role || null,
      sector: q.sector || null,
      mouStatus: isValidMouLifecycleFilter(rawMouStatus) ? rawMouStatus : null,
      from: q.from || q.date_from || null,
      to: q.to || q.date_to || null,
    },
  };
}

function validateSectorFilter(sector, allowedSectors) {
  if (!sector) return null;
  if (!allowedSectors.includes(sector)) {
    return 'Sector is outside your jurisdiction';
  }
  return null;
}

function resolveChangeLogRequest(req) {
  const parsed = parseChangeLogQuery(req);
  const role = req.user.role;

  if (isChangeLogOversightRole(role)) {
    return {
      parsed,
      viewerScope: 'all',
      jurisdictionSectors: null,
    };
  }

  if (role === 'sector_lead') {
    const sectorScopes = getSectorLeadScopedSectors(req.user);
    if (!sectorScopes.length) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    const sectorError = validateSectorFilter(parsed.filters.sector, sectorScopes);
    if (sectorError) {
      return { error: sectorError, status: 400 };
    }
    parsed.filters.sectorScopes = sectorScopes;
    const mineOnly = parseTruthy(req.query.mine_only);
    if (mineOnly) {
      parsed.filters.changedBy = req.user.id;
    }
    return {
      parsed,
      viewerScope: mineOnly ? 'own' : 'sector',
      jurisdictionSectors: sectorScopes,
    };
  }

  parsed.filters.changedBy = req.user.id;
  return {
    parsed,
    viewerScope: 'own',
    jurisdictionSectors: null,
  };
}

async function fetchChangeLogsForUser(req, { exportMode = false } = {}) {
  const resolved = resolveChangeLogRequest(req);
  if (resolved.error) {
    return { error: resolved.error, status: resolved.status };
  }

  const { parsed, viewerScope, jurisdictionSectors } = resolved;
  const listOptions = {
    ...parsed,
    limit: exportMode ? EXPORT_MAX_ROWS : parsed.limit,
    offset: exportMode ? 0 : parsed.offset,
    maxLimit: exportMode ? EXPORT_MAX_ROWS : 200,
  };

  let result;
  if (isChangeLogOversightRole(req.user.role)) {
    result = await listFilteredChangeLogs(listOptions);
  } else if (req.user.role === 'sector_lead') {
    result = await listFilteredChangeLogs(listOptions);
  } else {
    result = await listUserChangeLogs(req.user.id, listOptions);
  }

  return {
    parsed,
    viewerScope,
    jurisdictionSectors,
    result,
  };
}

async function getProposalRow(proposalId) {
  const [rows] = await pool.query('SELECT * FROM proposals WHERE id = ?', [proposalId]);
  return rows[0] || null;
}

function formatMouOptionLabel(row) {
  const pak = String(row.company_name || row.party_a_name || '').trim();
  const chinese = String(row.venture_name || row.party_b_name || '').trim();
  if (pak && chinese) return `${pak} / ${chinese}`;
  return pak || chinese || row.proposal_title || `MOU #${row.id}`;
}

async function getProposalChangeLogs(req, res) {
  try {
    const proposal = await getProposalRow(req.params.id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const oversight = isChangeLogOversightRole(req.user.role);
    const limit = req.query.limit;
    const offset = req.query.offset;
    const result = await listProposalChangeLogs(req.params.id, {
      limit,
      offset,
      changedBy: oversight ? null : req.user.id,
    });

    return res.json({
      proposal_id: Number(req.params.id),
      viewer_scope: oversight ? 'all' : 'own',
      logs: result.logs,
      total: result.total,
      count: result.logs.length,
    });
  } catch (err) {
    console.error('Get proposal change logs error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch change logs' });
  }
}

async function getChangeLogMouOptions(req, res) {
  try {
    const limit = req.query.limit;
    const offset = req.query.offset;
    const q = req.query.q;
    const result = await listMouOptionsForChangeLogs({ limit, offset, q });

    return res.json({
      options: result.options.map((row) => ({
        id: row.id,
        label: formatMouOptionLabel(row),
        company_name: row.company_name,
        venture_name: row.venture_name,
        proposal_title: row.proposal_title,
        status: row.status,
        log_count: row.log_count,
        last_log_at: row.last_log_at,
      })),
      total: result.total,
      count: result.options.length,
    });
  } catch (err) {
    console.error('Get change log MOU options error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch MOU options' });
  }
}

async function getChangeLogFilterOptions(req, res) {
  try {
    const isOversight = isChangeLogOversightRole(req.user.role);
    const sectorScopes =
      req.user.role === 'sector_lead' ? getSectorLeadScopedSectors(req.user) : null;

    if (req.user.role === 'sector_lead' && !sectorScopes.length) {
      return res.status(400).json({ error: 'Sector lead profile has no sector assigned' });
    }

    const options = await getChangeLogFilterOptionsData({
      sectorScopes: isOversight ? null : sectorScopes,
    });

    return res.json({
      viewer_role: req.user.role,
      ...options,
    });
  } catch (err) {
    console.error('Get change log filter options error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch change log filter options' });
  }
}

async function getRecentChangeLogs(req, res) {
  try {
    if (!isChangeLogOversightRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fetched = await fetchChangeLogsForUser(req);
    if (fetched.error) {
      return res.status(fetched.status).json({ error: fetched.error });
    }

    const { parsed, result } = fetched;
    return res.json({
      viewer_scope: 'all',
      filters_applied: parsed.filters,
      logs: result.logs,
      total: result.total,
      count: result.logs.length,
    });
  } catch (err) {
    console.error('Get recent change logs error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch recent change logs' });
  }
}

async function getSectorChangeLogs(req, res) {
  try {
    if (req.user.role !== 'sector_lead') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fetched = await fetchChangeLogsForUser(req);
    if (fetched.error) {
      return res.status(fetched.status).json({ error: fetched.error });
    }

    const { parsed, viewerScope, jurisdictionSectors, result } = fetched;
    return res.json({
      viewer_scope: viewerScope,
      jurisdiction_sectors: jurisdictionSectors,
      filters_applied: parsed.filters,
      logs: result.logs,
      total: result.total,
      count: result.logs.length,
    });
  } catch (err) {
    console.error('Get sector change logs error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sector change logs' });
  }
}

async function getMyChangeLogs(req, res) {
  try {
    const fetched = await fetchChangeLogsForUser(req);
    if (fetched.error) {
      return res.status(fetched.status).json({ error: fetched.error });
    }

    const { parsed, result } = fetched;
    return res.json({
      viewer_scope: 'own',
      filters_applied: parsed.filters,
      logs: result.logs,
      total: result.total,
      count: result.logs.length,
    });
  } catch (err) {
    console.error('Get my change logs error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch your change logs' });
  }
}

async function sendChangeLogsExport(res, report, { filename, format }) {
  if (format === 'csv') {
    const body = `\uFEFF${changeLogsToCsv(report)}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(body);
  }

  const body = await changeLogsToXlsx(report);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(body);
}

async function exportProposalChangeLogs(req, res) {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use csv or xlsx' });
    }

    const proposalId = Number(req.params.id);
    if (!proposalId) {
      return res.status(400).json({ error: 'Invalid proposal id' });
    }

    const proposal = await getProposalRow(proposalId);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const oversight = isChangeLogOversightRole(req.user.role);
    const filters = { proposalId };
    if (!oversight) {
      filters.changedBy = req.user.id;
    }

    const result = await listFilteredChangeLogs({
      limit: EXPORT_MAX_ROWS,
      offset: 0,
      maxLimit: EXPORT_MAX_ROWS,
      filters,
    });

    const proposalLabel = formatMouOptionLabel({
      id: proposalId,
      company_name: proposal.company_name,
      venture_name: proposal.venture_name,
      proposal_title: proposal.proposal_title,
      party_b_name: proposal.party_b_name,
    });

    const report = {
      filters_applied: { proposalId },
      logs: result.logs,
      meta: {
        filtered: false,
        viewer_scope: oversight ? 'all' : 'own',
        proposal_id: proposalId,
        proposal_label: proposalLabel,
        total: result.total,
        exported_count: result.logs.length,
        generated_at: new Date().toISOString(),
        generated_by_name: req.user.full_name || req.user.email,
        generated_by_role: req.user.role,
      },
    };

    const filename = buildProposalExportFilename(proposalId, format);
    return sendChangeLogsExport(res, report, { filename, format });
  } catch (err) {
    console.error('Export proposal change logs error:', err.message);
    return res.status(500).json({ error: 'Failed to export proposal change logs' });
  }
}

async function exportChangeLogsReport(req, res) {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use csv or xlsx' });
    }

    const fetched = await fetchChangeLogsForUser(req, { exportMode: true });
    if (fetched.error) {
      return res.status(fetched.status).json({ error: fetched.error });
    }

    const { parsed, viewerScope, jurisdictionSectors, result } = fetched;
    const filtered = hasActiveFilters(parsed.filters);
    const report = {
      filters_applied: parsed.filters,
      logs: result.logs,
      meta: {
        filtered,
        viewer_scope: viewerScope,
        jurisdiction_sectors: jurisdictionSectors,
        total: result.total,
        exported_count: result.logs.length,
        generated_at: new Date().toISOString(),
        generated_by_name: req.user.full_name || req.user.email,
        generated_by_role: req.user.role,
      },
    };

    const filename = buildExportFilename({ filtered, format });
    return sendChangeLogsExport(res, report, { filename, format });
  } catch (err) {
    console.error('Export change logs report error:', err.message);
    return res.status(500).json({ error: 'Failed to export change logs report' });
  }
}

module.exports = {
  getProposalChangeLogs,
  getChangeLogMouOptions,
  getChangeLogFilterOptions,
  getRecentChangeLogs,
  getSectorChangeLogs,
  getMyChangeLogs,
  exportChangeLogsReport,
  exportProposalChangeLogs,
};

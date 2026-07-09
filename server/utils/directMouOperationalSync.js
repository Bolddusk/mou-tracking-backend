function parseJson(value, fallback) {
  if (value === null || value === undefined) return { ...fallback };
  if (typeof value === 'object' && !Array.isArray(value)) return { ...fallback, ...value };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null ? { ...fallback, ...parsed } : { ...fallback };
    } catch {
      return { ...fallback };
    }
  }
  return { ...fallback };
}

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function parseUsdMillions(raw) {
  if (!hasValue(raw)) return null;
  const match = String(raw).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function formatUsdMillions(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value).trim();
  return `USD ${num} million`;
}

const EMPTY_EXEC = {
  company_overview: '',
  project_overview: '',
  project_segment: '',
  sector_alignment: '',
  investment_ask_summary: '',
  sifc_category: '',
  mou_operational_status: '',
  current_status: '',
  progress: '',
  bottlenecks: '',
  tentative_timeline: '',
  action_taken: '',
  location: '',
};

const EMPTY_PROJECT = {
  core_activity: '',
  site_location: '',
  site_readiness_status: '',
  phased_roadmap: '',
};

const EMPTY_INVESTMENT = {
  total_project_cost_usd: '',
  milestone_phase_1: '',
};

const EMPTY_CONFERENCE = {
  conference_name: '',
  conference_date: '',
  conference_end_date: '',
  conference_location: '',
  conference_host: '',
  conference_description: '',
};

function pickMerged(updates, body, key) {
  if (updates[key] !== undefined) return updates[key];
  if (body[key] !== undefined) return body[key];
  return undefined;
}

function pickJsonMerged(updates, body, key, fallback) {
  const raw = pickMerged(updates, body, key);
  if (raw === undefined) return { ...fallback };
  return parseJson(raw, fallback);
}

/**
 * Map 11-step wizard fields → imported MOU operational columns
 * so direct MOUs render like JSON-imported MOUs on MOU Details.
 */
function applyDirectMouOperationalSync(updates = {}, body = {}) {
  const executive_summary = pickJsonMerged(updates, body, 'executive_summary', EMPTY_EXEC);
  const project_overview = pickJsonMerged(updates, body, 'project_overview', EMPTY_PROJECT);
  const investment_ask = pickJsonMerged(updates, body, 'investment_ask', EMPTY_INVESTMENT);
  const conference_info = pickJsonMerged(updates, body, 'conference_info', EMPTY_CONFERENCE);

  const company_name = pickMerged(updates, body, 'company_name');
  const sector = pickMerged(updates, body, 'sector');
  const mou_description = pickMerged(updates, body, 'mou_description');
  const mou_scope = pickMerged(updates, body, 'mou_scope');
  const sifcCategory = pickMerged(updates, body, 'sifc_category') || executive_summary.sifc_category;

  const investmentUsd =
    parseUsdMillions(pickMerged(updates, body, 'investment_value_usd')) ||
    parseUsdMillions(investment_ask.total_project_cost_usd);

  if (investmentUsd !== null && updates.investment_value_usd === undefined) {
    updates.investment_value_usd = investmentUsd;
  }

  if (!hasValue(pickMerged(updates, body, 'cooperation_mode'))) {
    updates.cooperation_mode = 'mou';
  }

  if (!hasValue(pickMerged(updates, body, 'proposal_description'))) {
    const description =
      mou_description ||
      project_overview.core_activity ||
      executive_summary.project_overview ||
      mou_scope ||
      '';
    if (hasValue(description)) {
      updates.proposal_description = String(description).trim();
    }
  }

  if (hasValue(conference_info.conference_name) && updates.conference_name === undefined) {
    updates.conference_name = String(conference_info.conference_name).trim();
  }

  if (hasValue(body.conference_key) && updates.conference_key === undefined) {
    updates.conference_key = String(body.conference_key).trim();
  }

  if (!hasValue(pickMerged(updates, body, 'mou_demand')) && investmentUsd !== null) {
    updates.mou_demand = formatUsdMillions(investmentUsd);
  }

  if (!hasValue(pickMerged(updates, body, 'mou_sector')) && hasValue(sector)) {
    updates.mou_sector = String(sector).trim();
  }

  const exec = { ...executive_summary };

  if (hasValue(sifcCategory)) {
    exec.sifc_category = String(sifcCategory).trim();
  }

  if (!hasValue(exec.mou_operational_status)) {
    exec.mou_operational_status = 'Active';
  }

  if (!hasValue(exec.location)) {
    exec.location =
      project_overview.site_location ||
      conference_info.conference_location ||
      pickMerged(updates, body, 'jurisdiction') ||
      '';
  }

  if (!hasValue(exec.progress)) {
    exec.progress =
      project_overview.core_activity ||
      executive_summary.project_overview ||
      mou_description ||
      '';
  }

  if (!hasValue(exec.bottlenecks)) {
    exec.bottlenecks = 'Nil';
  }

  if (!hasValue(exec.tentative_timeline)) {
    exec.tentative_timeline =
      investment_ask.milestone_phase_1 ||
      project_overview.phased_roadmap ||
      'Not specified';
  }

  if (!hasValue(exec.current_status)) {
    exec.current_status = project_overview.site_readiness_status || '';
  }

  if (!hasValue(exec.action_taken)) {
    exec.action_taken = '';
  }

  if (!hasValue(exec.investment_ask_summary) && investmentUsd !== null) {
    exec.investment_ask_summary = formatUsdMillions(investmentUsd);
  }

  if (!hasValue(exec.sector_alignment) && hasValue(sector)) {
    exec.sector_alignment = String(sector).trim();
  }

  if (!hasValue(exec.project_segment) && hasValue(mou_scope)) {
    exec.project_segment = String(mou_scope).trim();
  }

  if (!hasValue(exec.company_overview) && hasValue(company_name)) {
    exec.company_overview = String(company_name).trim();
  }

  updates.executive_summary = exec;

  return updates;
}

function buildOperationalSyncFromProposalRow(row) {
  if (!row) return {};
  const body = {
    ...row,
    executive_summary: parseJson(row.executive_summary, EMPTY_EXEC),
    project_overview: parseJson(row.project_overview, EMPTY_PROJECT),
    investment_ask: parseJson(row.investment_ask, EMPTY_INVESTMENT),
    conference_info: parseJson(row.conference_info, EMPTY_CONFERENCE),
    party_a_info: parseJson(row.party_a_info, {}),
    party_b_info: parseJson(row.party_b_info, {}),
  };
  return applyDirectMouOperationalSync({}, body);
}

function operationalSyncNeedsPersist(beforeRow, afterUpdates) {
  const keys = [
    'investment_value_usd',
    'cooperation_mode',
    'proposal_description',
    'conference_name',
    'conference_key',
    'mou_demand',
    'mou_sector',
    'executive_summary',
  ];
  return keys.some((key) => {
    if (afterUpdates[key] === undefined) return false;
    const beforeVal = beforeRow[key];
    const afterVal = afterUpdates[key];
    if (key === 'executive_summary') {
      return JSON.stringify(parseJson(beforeVal, {})) !== JSON.stringify(afterVal);
    }
    return String(beforeVal ?? '') !== String(afterVal ?? '');
  });
}

function stringifyOperationalUpdates(updates) {
  const next = { ...updates };
  if (next.executive_summary && typeof next.executive_summary === 'object') {
    next.executive_summary = JSON.stringify(next.executive_summary);
  }
  return next;
}

async function persistOperationalSyncForProposal(pool, proposalRow) {
  const syncUpdates = buildOperationalSyncFromProposalRow(proposalRow);
  if (!operationalSyncNeedsPersist(proposalRow, syncUpdates)) {
    return { updated: false, updates: {} };
  }

  const persisted = stringifyOperationalUpdates(syncUpdates);
  const setClause = Object.keys(persisted)
    .map((key) => `${key} = ?`)
    .join(', ');

  await pool.query(`UPDATE proposals SET ${setClause} WHERE id = ?`, [
    ...Object.values(persisted),
    proposalRow.id,
  ]);

  return { updated: true, updates: persisted };
}

module.exports = {
  applyDirectMouOperationalSync,
  buildOperationalSyncFromProposalRow,
  operationalSyncNeedsPersist,
  persistOperationalSyncForProposal,
  parseUsdMillions,
  formatUsdMillions,
};

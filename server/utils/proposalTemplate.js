const FINANCIAL_METRICS = [
  { key: 'total_revenue', label: 'Total Revenue', category: 'Income Statement', unit: 'PKR Mn' },
  { key: 'ebitda', label: 'EBITDA', category: 'Income Statement', unit: 'PKR Mn' },
  { key: 'net_income', label: 'Net Income', category: 'Income Statement', unit: 'PKR Mn' },
  { key: 'total_assets', label: 'Total Assets', category: 'Balance Sheet', unit: 'PKR Mn' },
  { key: 'total_debt', label: 'Total Debt', category: 'Balance Sheet', unit: 'PKR Mn' },
  { key: 'shareholder_equity', label: 'Shareholder Equity', category: 'Balance Sheet', unit: 'PKR Mn' },
  { key: 'gross_profit_margin', label: 'Gross Profit Margin', category: 'Profitability', unit: '%' },
  { key: 'ebitda_margin', label: 'EBITDA Margin', category: 'Profitability', unit: '%' },
  { key: 'return_on_equity', label: 'Return on Equity (ROE)', category: 'Liquidity & Risk', unit: '%' },
  { key: 'current_ratio', label: 'Current Ratio (Liquidity)', category: 'Liquidity & Risk', unit: 'Ratio' },
  { key: 'debt_to_equity', label: 'Debt-to-Equity', category: 'Liquidity & Risk', unit: 'Ratio' },
];

const PROJECT_TYPES = ['Greenfield', 'Brownfield'];

const ENGAGEMENT_TYPES = ['G2G', 'B2B', 'B2G', 'G2B'];

const ENTITY_TYPES = ['government', 'business'];

const JSON_FIELDS = [
  'conference_info',
  'party_a_info',
  'executive_summary',
  'company_overview',
  'project_overview',
  'financials',
  'investment_ask',
  'contact_info',
];

const SCALAR_DRAFT_FIELDS = [
  'engagement_type',
  'party_b_entity_type',
  'sector',
  'company_name',
  'company_logo_url',
  'cover_image_url',
  'project_type',
  'venture_name',
  'proposal_file_url',
  'party_b_name',
  'party_b_organization',
  'party_b_email',
  'party_b_phone',
  'party_b_country',
  'mou_scope',
  'mou_description',
  'mou_sector',
  'mou_demand',
  'mou_file_url',
];

const EMPTY_CONFERENCE_INFO = {
  conference_name: '',
  conference_date: '',
  conference_end_date: '',
  conference_location: '',
  conference_host: '',
  conference_description: '',
};

const EMPTY_PARTY_A_INFO = {
  entity_type: '',
  organization_name: '',
  department_ministry: '',
  contact_name: '',
  designation: '',
  email: '',
  phone: '',
  country: '',
  city: '',
};

const EMPTY_EXECUTIVE_SUMMARY = {
  company_overview: '',
  project_overview: '',
  project_segment: '',
  sector_alignment: '',
  investment_ask_summary: '',
};

const EMPTY_COMPANY_OVERVIEW = {
  years_in_operation: '',
  market_standing_pakistan: '',
  key_certifications: '',
  infrastructure_assets: '',
  land_project_capacity: '',
  value_chain_scope: '',
  local_provisions: '',
  export_centricity: '',
};

const EMPTY_PROJECT_OVERVIEW = {
  core_activity: '',
  site_location: '',
  site_readiness_status: '',
  chinese_technology_sought: '',
  value_addition_goal: '',
  target_production_capacity: '',
  phased_roadmap: '',
  economic_impact: '',
  sustainability_metrics: '',
};

const EMPTY_INVESTMENT_ASK = {
  total_project_cost_usd: '',
  investment_ask_equity_usd: '',
  investment_ask_debt_usd: '',
  sponsor_contribution_type: '',
  sponsor_contribution_amount: '',
  fund_utilization_technology_pct: '',
  fund_utilization_infrastructure_pct: '',
  fund_utilization_working_capital_pct: '',
  projected_irr_pct: '',
  payback_period_years: '',
  milestone_phase_1: '',
  milestone_phase_2: '',
  milestone_phase_3: '',
  sponsor_contribution_pkr_mn: '',
  raising_from_investors_pkr_mn: '',
  total_funds_required_pkr_mn: '',
};

const EMPTY_CONTACT_INFO = {
  name: '',
  designation: '',
  email: '',
  cell: '',
  wechat: '',
};

const EMPTY_FINANCIALS = {
  years: [{ label: 'FY 20__', metrics: {} }],
  additional_rows: [],
};

function emptyMetrics() {
  return FINANCIAL_METRICS.reduce((acc, m) => ({ ...acc, [m.key]: '' }), {});
}

function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function hasMeaningfulProposalDraft(body) {
  if (!body || typeof body !== 'object') return false;

  if (hasValue(body.engagement_type)) return true;
  if (hasValue(body.venture_name) || hasValue(body.company_name)) return true;
  if (hasValue(body.sector) || hasValue(body.project_type)) return true;
  if (hasValue(body.proposal_file_url) || hasValue(body.mou_file_url)) return true;

  const conference =
    typeof body.conference_info === 'object' ? body.conference_info : parseJsonField(body.conference_info, {});
  if (Object.values(conference).some(hasValue)) return true;

  const partyA =
    typeof body.party_a_info === 'object' ? body.party_a_info : parseJsonField(body.party_a_info, {});
  if (Object.values(partyA).some(hasValue)) return true;

  const submitter =
    typeof body.submitter_info === 'object'
      ? body.submitter_info
      : parseJsonField(body.submitter_info, {});
  if (Object.values(submitter).some(hasValue)) return true;

  return false;
}

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return { ...fallback };
  if (typeof value === 'object') return { ...fallback, ...value };
  try {
    const parsed = JSON.parse(value);
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}

function normalizeFinancials(raw) {
  const data = parseJsonField(raw, EMPTY_FINANCIALS);
  const years = Array.isArray(data.years) && data.years.length
    ? data.years.map((y) => ({
        label: y.label || '',
        metrics: { ...emptyMetrics(), ...(y.metrics || {}) },
      }))
    : [{ label: 'FY 20__', metrics: emptyMetrics() }];

  const additional_rows = Array.isArray(data.additional_rows) ? data.additional_rows : [];
  return { years, additional_rows };
}

function enrichProposalRow(row) {
  if (!row) return row;

  const conference_info = parseJsonField(row.conference_info, EMPTY_CONFERENCE_INFO);
  const party_a_info = parseJsonField(row.party_a_info, EMPTY_PARTY_A_INFO);
  const executive_summary = parseJsonField(row.executive_summary, EMPTY_EXECUTIVE_SUMMARY);
  const company_overview = parseJsonField(row.company_overview, EMPTY_COMPANY_OVERVIEW);
  const project_overview = parseJsonField(row.project_overview, EMPTY_PROJECT_OVERVIEW);
  const financials = normalizeFinancials(row.financials);
  const investment_ask = parseJsonField(row.investment_ask, EMPTY_INVESTMENT_ASK);
  const contact_info = parseJsonField(row.contact_info, EMPTY_CONTACT_INFO);

  const display_title =
    row.venture_name ||
    row.company_name ||
    row.proposal_title ||
    'Untitled Proposal';

  return {
    ...row,
    conference_info,
    party_a_info,
    executive_summary,
    company_overview,
    project_overview,
    financials,
    investment_ask,
    contact_info,
    display_title,
    proposal_title: display_title,
  };
}

function enrichProposals(rows) {
  return rows.map(enrichProposalRow);
}

function stringifyJsonFields(updates) {
  const out = { ...updates };
  for (const field of JSON_FIELDS) {
    if (out[field] !== undefined && typeof out[field] === 'object') {
      out[field] = JSON.stringify(out[field]);
    }
  }
  return out;
}

function sanitizeEnumField(value, allowed) {
  if (value === undefined) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return allowed.includes(trimmed) ? trimmed : undefined;
}

function buildDraftUpdates(body) {
  const updates = {};

  for (const field of SCALAR_DRAFT_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  for (const field of JSON_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const engagementType = sanitizeEnumField(updates.engagement_type, ENGAGEMENT_TYPES);
  if (engagementType === undefined) {
    delete updates.engagement_type;
  } else {
    updates.engagement_type = engagementType;
  }

  const partyBEntityType = sanitizeEnumField(updates.party_b_entity_type, ENTITY_TYPES);
  if (partyBEntityType === undefined) {
    delete updates.party_b_entity_type;
  } else {
    updates.party_b_entity_type = partyBEntityType;
  }

  if (updates.venture_name || updates.company_name) {
    updates.proposal_title = updates.venture_name || updates.company_name || '';
  }

  return stringifyJsonFields(updates);
}

function validateSubmit(proposal) {
  const enriched = enrichProposalRow(proposal);
  const missing = [];

  const scalarRequired = [
    { key: 'engagement_type', label: 'Engagement Type (G2G/B2B/B2G/G2B)' },
    { key: 'party_b_entity_type', label: 'Party B Entity Type' },
    { key: 'sector', label: 'Sector' },
    { key: 'company_name', label: 'Company Name' },
    { key: 'project_type', label: 'Project Type' },
    { key: 'venture_name', label: 'Venture Name' },
    { key: 'party_b_name', label: 'Party B Full Name' },
    { key: 'party_b_organization', label: 'Party B Organization' },
    { key: 'party_b_email', label: 'Party B Email' },
    { key: 'party_b_phone', label: 'Party B Phone' },
    { key: 'party_b_country', label: 'Party B Country' },
    { key: 'mou_scope', label: 'MOU Scope' },
    { key: 'mou_description', label: 'MOU Description' },
    { key: 'mou_sector', label: 'MOU Sector' },
    { key: 'mou_demand', label: 'MOU Demand' },
    { key: 'mou_file_url', label: 'MOU File' },
  ];

  scalarRequired.forEach(({ key, label }) => {
    if (!hasValue(enriched[key])) missing.push(label);
  });

  Object.entries({
    conference_name: 'Conference — Name',
    conference_date: 'Conference — Date',
    conference_location: 'Conference — Location',
    conference_host: 'Conference — Host / Organizer',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.conference_info[key])) missing.push(label);
  });

  Object.entries({
    entity_type: 'Party A — Entity Type',
    organization_name: 'Party A — Organization Name',
    contact_name: 'Party A — Contact Name',
    designation: 'Party A — Designation',
    email: 'Party A — Email',
    phone: 'Party A — Phone',
    country: 'Party A — Country',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.party_a_info[key])) missing.push(label);
  });

  const execRequired = [
    ['company_overview', 'Executive — Company Overview'],
    ['project_overview', 'Executive — Project Overview'],
    ['project_segment', 'Executive — Project Segment'],
    ['sector_alignment', 'Executive — Sector Alignment'],
    ['investment_ask_summary', 'Executive — Investment Ask Summary'],
  ];
  execRequired.forEach(([key, label]) => {
    if (!hasValue(enriched.executive_summary[key])) missing.push(label);
  });

  Object.entries({
    years_in_operation: 'Company — Years in Operation',
    market_standing_pakistan: 'Company — Market Standing',
    key_certifications: 'Company — Key Certifications',
    infrastructure_assets: 'Company — Infrastructure & Assets',
    land_project_capacity: 'Company — Land/Project/Capacity',
    value_chain_scope: 'Company — Value Chain Scope',
    local_provisions: 'Company — What You Provide',
    export_centricity: 'Company — Export Centricity',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.company_overview[key])) missing.push(label);
  });

  Object.entries({
    core_activity: 'Project — Core Activity',
    site_location: 'Project — Site Location',
    site_readiness_status: 'Project — Site Readiness',
    chinese_technology_sought: 'Project — Chinese Technology Sought',
    value_addition_goal: 'Project — Value Addition Goal',
    target_production_capacity: 'Project — Production Capacity',
    phased_roadmap: 'Project — Phased Roadmap',
    economic_impact: 'Project — Economic Impact',
    sustainability_metrics: 'Project — Sustainability Metrics',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.project_overview[key])) missing.push(label);
  });

  if (!enriched.financials.years.length) {
    missing.push('Financials — At least one fiscal year');
  } else {
    enriched.financials.years.forEach((year, idx) => {
      if (!hasValue(year.label)) missing.push(`Financials — Year ${idx + 1} label`);
    });
  }

  Object.entries({
    total_project_cost_usd: 'Investment — Total Project Cost (USD)',
    investment_ask_equity_usd: 'Investment — Equity Ask (USD)',
    sponsor_contribution_type: 'Investment — Sponsor Contribution Type',
    sponsor_contribution_amount: 'Investment — Sponsor Contribution Amount',
    fund_utilization_technology_pct: 'Investment — Technology Utilization %',
    fund_utilization_infrastructure_pct: 'Investment — Infrastructure Utilization %',
    fund_utilization_working_capital_pct: 'Investment — Working Capital Utilization %',
    projected_irr_pct: 'Investment — Projected IRR %',
    payback_period_years: 'Investment — Payback Period',
    milestone_phase_1: 'Investment — Phase 1 Milestone',
    milestone_phase_2: 'Investment — Phase 2 Milestone',
    milestone_phase_3: 'Investment — Phase 3 Milestone',
    sponsor_contribution_pkr_mn: 'Investment — Sponsor Contribution (PKR Mn)',
    raising_from_investors_pkr_mn: 'Investment — Raising from Investors (PKR Mn)',
    total_funds_required_pkr_mn: 'Investment — Total Funds Required (PKR Mn)',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.investment_ask[key])) missing.push(label);
  });

  const utilTotal =
    Number(enriched.investment_ask.fund_utilization_technology_pct || 0) +
    Number(enriched.investment_ask.fund_utilization_infrastructure_pct || 0) +
    Number(enriched.investment_ask.fund_utilization_working_capital_pct || 0);
  if (utilTotal !== 100) {
    missing.push('Investment — Fund utilization must total 100%');
  }

  Object.entries({
    name: 'Contact — Name',
    designation: 'Contact — Designation',
    email: 'Contact — Email',
    cell: 'Contact — Cell',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.contact_info[key])) missing.push(label);
  });

  return missing;
}

function validatePartyAOnlySubmit(proposal) {
  const enriched = enrichProposalRow(proposal);
  const missing = [];

  const scalarRequired = [
    { key: 'engagement_type', label: 'Engagement Type (G2G/B2B/B2G/G2B)' },
    { key: 'sector', label: 'Sector' },
    { key: 'company_name', label: 'Company Name' },
    { key: 'project_type', label: 'Project Type' },
    { key: 'venture_name', label: 'Venture Name' },
  ];

  scalarRequired.forEach(({ key, label }) => {
    if (!hasValue(enriched[key])) missing.push(label);
  });

  Object.entries({
    conference_name: 'Conference — Name',
    conference_date: 'Conference — Date',
    conference_location: 'Conference — Location',
    conference_host: 'Conference — Host / Organizer',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.conference_info[key])) missing.push(label);
  });

  Object.entries({
    entity_type: 'Party A — Entity Type',
    organization_name: 'Party A — Organization Name',
    contact_name: 'Party A — Contact Name',
    designation: 'Party A — Designation',
    email: 'Party A — Email',
    phone: 'Party A — Phone',
    country: 'Party A — Country',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.party_a_info[key])) missing.push(label);
  });

  const execRequired = [
    ['company_overview', 'Executive — Company Overview'],
    ['project_overview', 'Executive — Project Overview'],
    ['project_segment', 'Executive — Project Segment'],
    ['sector_alignment', 'Executive — Sector Alignment'],
    ['investment_ask_summary', 'Executive — Investment Ask Summary'],
  ];
  execRequired.forEach(([key, label]) => {
    if (!hasValue(enriched.executive_summary[key])) missing.push(label);
  });

  Object.entries({
    years_in_operation: 'Company — Years in Operation',
    market_standing_pakistan: 'Company — Market Standing',
    key_certifications: 'Company — Key Certifications',
    infrastructure_assets: 'Company — Infrastructure & Assets',
    land_project_capacity: 'Company — Land/Project/Capacity',
    value_chain_scope: 'Company — Value Chain Scope',
    local_provisions: 'Company — What You Provide',
    export_centricity: 'Company — Export Centricity',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.company_overview[key])) missing.push(label);
  });

  Object.entries({
    core_activity: 'Project — Core Activity',
    site_location: 'Project — Site Location',
    site_readiness_status: 'Project — Site Readiness',
    chinese_technology_sought: 'Project — Chinese Technology Sought',
    value_addition_goal: 'Project — Value Addition Goal',
    target_production_capacity: 'Project — Production Capacity',
    phased_roadmap: 'Project — Phased Roadmap',
    economic_impact: 'Project — Economic Impact',
    sustainability_metrics: 'Project — Sustainability Metrics',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.project_overview[key])) missing.push(label);
  });

  if (!enriched.financials.years.length) {
    missing.push('Financials — At least one fiscal year');
  } else {
    enriched.financials.years.forEach((year, idx) => {
      if (!hasValue(year.label)) missing.push(`Financials — Year ${idx + 1} label`);
    });
  }

  Object.entries({
    total_project_cost_usd: 'Investment — Total Project Cost (USD)',
    investment_ask_equity_usd: 'Investment — Equity Ask (USD)',
    sponsor_contribution_type: 'Investment — Sponsor Contribution Type',
    sponsor_contribution_amount: 'Investment — Sponsor Contribution Amount',
    fund_utilization_technology_pct: 'Investment — Technology Utilization %',
    fund_utilization_infrastructure_pct: 'Investment — Infrastructure Utilization %',
    fund_utilization_working_capital_pct: 'Investment — Working Capital Utilization %',
    projected_irr_pct: 'Investment — Projected IRR %',
    payback_period_years: 'Investment — Payback Period',
    milestone_phase_1: 'Investment — Phase 1 Milestone',
    milestone_phase_2: 'Investment — Phase 2 Milestone',
    milestone_phase_3: 'Investment — Phase 3 Milestone',
    sponsor_contribution_pkr_mn: 'Investment — Sponsor Contribution (PKR Mn)',
    raising_from_investors_pkr_mn: 'Investment — Raising from Investors (PKR Mn)',
    total_funds_required_pkr_mn: 'Investment — Total Funds Required (PKR Mn)',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.investment_ask[key])) missing.push(label);
  });

  const utilTotal =
    Number(enriched.investment_ask.fund_utilization_technology_pct || 0) +
    Number(enriched.investment_ask.fund_utilization_infrastructure_pct || 0) +
    Number(enriched.investment_ask.fund_utilization_working_capital_pct || 0);
  if (utilTotal !== 100) {
    missing.push('Investment — Fund utilization must total 100%');
  }

  Object.entries({
    name: 'Contact — Name',
    designation: 'Contact — Designation',
    email: 'Contact — Email',
    cell: 'Contact — Cell',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.contact_info[key])) missing.push(label);
  });

  return missing;
}

const PARTY_A_ONLY_STRIP_FIELDS = new Set([
  'party_b_entity_type',
  'party_b_name',
  'party_b_organization',
  'party_b_email',
  'party_b_phone',
  'party_b_country',
  'mou_scope',
  'mou_description',
  'mou_sector',
  'mou_demand',
  'mou_file_url',
]);

function buildPartyAOnlyDraftUpdates(body) {
  const updates = buildDraftUpdates(body);
  PARTY_A_ONLY_STRIP_FIELDS.forEach((key) => delete updates[key]);
  return updates;
}

const CHINA_STRIP_FIELDS = new Set([
  'party_a_info',
  'mou_scope',
  'mou_description',
  'mou_sector',
  'mou_demand',
  'mou_file_url',
]);

function buildChinaProposalUpdates(body) {
  const updates = buildDraftUpdates(body);
  CHINA_STRIP_FIELDS.forEach((key) => delete updates[key]);
  return updates;
}

const MM_PROPOSAL_DRAFT_FIELDS = [
  'country',
  'sector',
  'title',
  'description',
  'investment_amount',
  'side',
];

// Legacy minimal MM helpers — use server/utils/mmProposalTemplate.js instead.
function buildMmProposalDraftUpdates(body) {
  const updates = {};
  MM_PROPOSAL_DRAFT_FIELDS.forEach((key) => {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  });
  if (body.keywords !== undefined) {
    updates.keywords =
      typeof body.keywords === 'string' ? body.keywords : JSON.stringify(body.keywords);
  }
  return updates;
}

function validateMmProposalSubmit(proposal) {
  const missing = [];
  if (!hasValue(proposal.country)) missing.push('Country');
  if (!hasValue(proposal.sector)) missing.push('Sector');
  if (!hasValue(proposal.title)) missing.push('Title');
  if (!hasValue(proposal.side)) missing.push('Side');
  if (proposal.side && !['side_a', 'side_b'].includes(proposal.side)) {
    missing.push('Side must be side_a or side_b');
  }
  return missing;
}

function validateChinaProposalSubmit(proposal) {
  const enriched = enrichProposalRow(proposal);
  const missing = [];

  const scalarRequired = [
    { key: 'engagement_type', label: 'Engagement Type (G2G/B2B/B2G/G2B)' },
    { key: 'sector', label: 'Sector' },
    { key: 'company_name', label: 'Company Name' },
    { key: 'project_type', label: 'Project Type' },
    { key: 'venture_name', label: 'Venture Name' },
    { key: 'party_b_entity_type', label: 'Chinese Party — Entity Type' },
    { key: 'party_b_name', label: 'Chinese Party — Full Name' },
    { key: 'party_b_organization', label: 'Chinese Party — Organization' },
    { key: 'party_b_email', label: 'Chinese Party — Email' },
    { key: 'party_b_phone', label: 'Chinese Party — Phone' },
    { key: 'party_b_country', label: 'Chinese Party — Country' },
  ];

  scalarRequired.forEach(({ key, label }) => {
    if (!hasValue(enriched[key])) missing.push(label);
  });

  const execRequired = [
    ['company_overview', 'Executive — Company Overview'],
    ['project_overview', 'Executive — Project Overview'],
    ['project_segment', 'Executive — Project Segment'],
    ['sector_alignment', 'Executive — Sector Alignment'],
    ['investment_ask_summary', 'Executive — Investment Ask Summary'],
  ];
  execRequired.forEach(([key, label]) => {
    if (!hasValue(enriched.executive_summary[key])) missing.push(label);
  });

  Object.entries({
    years_in_operation: 'Company — Years in Operation',
    key_certifications: 'Company — Key Certifications',
    infrastructure_assets: 'Company — Infrastructure & Assets',
    value_chain_scope: 'Company — Value Chain Scope',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.company_overview[key])) missing.push(label);
  });

  Object.entries({
    core_activity: 'Project — Core Activity',
    site_location: 'Project — Site Location',
    target_production_capacity: 'Project — Production Capacity',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.project_overview[key])) missing.push(label);
  });

  if (!enriched.financials.years.length) {
    missing.push('Financials — At least one fiscal year');
  }

  Object.entries({
    total_project_cost_usd: 'Investment — Total Project Cost (USD)',
    investment_ask_equity_usd: 'Investment — Equity Ask (USD)',
    fund_utilization_technology_pct: 'Investment — Technology Utilization %',
    fund_utilization_infrastructure_pct: 'Investment — Infrastructure Utilization %',
    fund_utilization_working_capital_pct: 'Investment — Working Capital Utilization %',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.investment_ask[key])) missing.push(label);
  });

  const utilTotal =
    Number(enriched.investment_ask.fund_utilization_technology_pct || 0) +
    Number(enriched.investment_ask.fund_utilization_infrastructure_pct || 0) +
    Number(enriched.investment_ask.fund_utilization_working_capital_pct || 0);
  if (utilTotal !== 100) {
    missing.push('Investment — Fund utilization must total 100%');
  }

  Object.entries({
    name: 'Contact — Name',
    email: 'Contact — Email',
    cell: 'Contact — Cell',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.contact_info[key])) missing.push(label);
  });

  return missing;
}

module.exports = {
  FINANCIAL_METRICS,
  PROJECT_TYPES,
  ENGAGEMENT_TYPES,
  ENTITY_TYPES,
  JSON_FIELDS,
  SCALAR_DRAFT_FIELDS,
  EMPTY_CONFERENCE_INFO,
  EMPTY_PARTY_A_INFO,
  EMPTY_EXECUTIVE_SUMMARY,
  EMPTY_COMPANY_OVERVIEW,
  EMPTY_PROJECT_OVERVIEW,
  EMPTY_INVESTMENT_ASK,
  EMPTY_CONTACT_INFO,
  EMPTY_FINANCIALS,
  emptyMetrics,
  enrichProposalRow,
  enrichProposals,
  buildDraftUpdates,
  stringifyJsonFields,
  validateSubmit,
  validatePartyAOnlySubmit,
  buildPartyAOnlyDraftUpdates,
  buildChinaProposalUpdates,
  validateChinaProposalSubmit,
  hasMeaningfulProposalDraft,
  hasValue,
  parseJsonField,
  normalizeFinancials,
  sanitizeEnumField,
};

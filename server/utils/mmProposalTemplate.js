const {
  ENGAGEMENT_TYPES,
  EMPTY_CONFERENCE_INFO,
  EMPTY_PARTY_A_INFO,
  EMPTY_EXECUTIVE_SUMMARY,
  EMPTY_COMPANY_OVERVIEW,
  EMPTY_PROJECT_OVERVIEW,
  EMPTY_INVESTMENT_ASK,
  EMPTY_CONTACT_INFO,
  EMPTY_FINANCIALS,
  enrichProposalRow,
  parseJsonField,
  normalizeFinancials,
  sanitizeEnumField,
  hasValue,
} = require('./proposalTemplate');

const MM_TABLE_FIELDS = ['country', 'sector', 'title', 'description', 'investment_amount', 'side'];

const MM_KEYWORD_SCALAR_FIELDS = [
  'engagement_type',
  'company_name',
  'venture_name',
  'project_type',
  'company_logo_url',
  'cover_image_url',
  'proposal_file_url',
];

const MM_KEYWORD_JSON_FIELDS = [
  'conference_info',
  'submitter_info',
  'executive_summary',
  'company_overview',
  'project_overview',
  'financials',
  'investment_ask',
  'contact_info',
];

function parseMmKeywords(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function enrichMmProposalRow(row) {
  if (!row) return row;

  const kw = parseMmKeywords(row.keywords);
  const conference_info = parseJsonField(kw.conference_info, EMPTY_CONFERENCE_INFO);
  const submitter_info = parseJsonField(
    kw.submitter_info || kw.party_a_info,
    EMPTY_PARTY_A_INFO
  );
  const executive_summary = parseJsonField(kw.executive_summary, EMPTY_EXECUTIVE_SUMMARY);
  const company_overview = parseJsonField(kw.company_overview, EMPTY_COMPANY_OVERVIEW);
  const project_overview = parseJsonField(kw.project_overview, EMPTY_PROJECT_OVERVIEW);
  const financials = normalizeFinancials(kw.financials);
  const investment_ask = parseJsonField(kw.investment_ask, EMPTY_INVESTMENT_ASK);
  const contact_info = parseJsonField(kw.contact_info, EMPTY_CONTACT_INFO);

  const file_url = kw.file_url || kw.proposal_file_url || null;
  const keyword_tags = Array.isArray(kw.tags) ? kw.tags : [];

  const venture_name = kw.venture_name || row.title || '';
  const company_name = kw.company_name || '';
  const display_title = venture_name || company_name || row.title || 'Untitled Proposal';

  let investment_amount = row.investment_amount != null ? Number(row.investment_amount) : null;
  if (investment_amount == null && hasValue(investment_ask.total_project_cost_usd)) {
    investment_amount = Number(investment_ask.total_project_cost_usd);
  }

  return {
    ...row,
    keywords: kw,
    keyword_tags,
    file_url,
    engagement_type: kw.engagement_type || null,
    company_name,
    venture_name,
    project_type: kw.project_type || null,
    company_logo_url: kw.company_logo_url || null,
    cover_image_url: kw.cover_image_url || null,
    proposal_file_url: file_url,
    conference_info,
    submitter_info,
    executive_summary,
    company_overview,
    project_overview,
    financials,
    investment_ask,
    contact_info,
    display_title,
    investment_amount,
    description:
      row.description ||
      executive_summary.project_overview ||
      executive_summary.investment_ask_summary ||
      '',
  };
}

function hasMeaningfulMmDraft(body) {
  if (!body || typeof body !== 'object') return false;
  if (hasValue(body.engagement_type)) return true;
  if (hasValue(body.venture_name) || hasValue(body.company_name) || hasValue(body.title)) return true;
  if (hasValue(body.sector) || hasValue(body.country) || hasValue(body.project_type)) return true;
  if (hasValue(body.file_url) || hasValue(body.proposal_file_url)) return true;

  const conference =
    typeof body.conference_info === 'object'
      ? body.conference_info
      : parseJsonField(body.conference_info, EMPTY_CONFERENCE_INFO);
  if (Object.values(conference).some(hasValue)) return true;

  const submitter =
    typeof body.submitter_info === 'object'
      ? body.submitter_info
      : parseJsonField(body.submitter_info, EMPTY_PARTY_A_INFO);
  if (Object.values(submitter).some(hasValue)) return true;

  return false;
}

function buildMmProposalDraftUpdates(body, existingKeywordsRaw = null) {
  const existingKw = parseMmKeywords(existingKeywordsRaw);
  const keywords = { ...existingKw };
  const tableUpdates = {};

  MM_TABLE_FIELDS.forEach((key) => {
    if (body[key] !== undefined) {
      tableUpdates[key] = body[key];
    }
  });

  MM_KEYWORD_SCALAR_FIELDS.forEach((key) => {
    if (body[key] !== undefined) {
      keywords[key] = body[key];
    }
  });

  if (body.engagement_type !== undefined) {
    const engagementType = sanitizeEnumField(body.engagement_type, ENGAGEMENT_TYPES);
    if (engagementType) {
      keywords.engagement_type = engagementType;
    } else if (!hasValue(body.engagement_type)) {
      delete keywords.engagement_type;
    }
  }

  MM_KEYWORD_JSON_FIELDS.forEach((field) => {
    if (body[field] !== undefined) {
      keywords[field] =
        typeof body[field] === 'object'
          ? body[field]
          : parseJsonField(body[field], {});
    }
  });

  if (body.file_url !== undefined) {
    keywords.file_url = body.file_url;
    keywords.proposal_file_url = body.file_url;
  }
  if (body.proposal_file_url !== undefined) {
    keywords.proposal_file_url = body.proposal_file_url;
    keywords.file_url = body.proposal_file_url;
  }

  if (body.keyword_tags !== undefined) {
    keywords.tags = Array.isArray(body.keyword_tags) ? body.keyword_tags : [];
  } else if (Array.isArray(body.keywords)) {
    keywords.tags = body.keywords;
  }

  const ventureName = body.venture_name ?? keywords.venture_name;
  if (ventureName) {
    tableUpdates.title = String(ventureName).trim();
  } else if (body.title) {
    tableUpdates.title = String(body.title).trim();
  } else if (body.company_name) {
    tableUpdates.title = String(body.company_name).trim();
  } else if (keywords.company_name) {
    tableUpdates.title = String(keywords.company_name).trim();
  }

  const investAmount =
    body.investment_amount !== undefined && body.investment_amount !== ''
      ? body.investment_amount
      : body.investment_ask?.total_project_cost_usd;
  if (investAmount !== undefined && investAmount !== '') {
    tableUpdates.investment_amount = Number(investAmount);
  }

  if (body.description !== undefined) {
    tableUpdates.description = body.description;
  } else if (body.executive_summary?.project_overview) {
    tableUpdates.description = body.executive_summary.project_overview;
  }

  tableUpdates.keywords = JSON.stringify(keywords);
  return tableUpdates;
}

function validateMmSideASubmit(proposal) {
  const enriched = enrichMmProposalRow(proposal);
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

  if (!hasValue(enriched.country)) missing.push('Country');

  Object.entries({
    conference_name: 'Conference — Name',
    conference_date: 'Conference — Date',
    conference_location: 'Conference — Location',
    conference_host: 'Conference — Host / Organizer',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.conference_info[key])) missing.push(label);
  });

  Object.entries({
    entity_type: 'Organization — Entity Type',
    organization_name: 'Organization — Name',
    contact_name: 'Contact — Full Name',
    designation: 'Contact — Designation',
    email: 'Contact — Email',
    phone: 'Contact — Phone',
    country: 'Organization — Country',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.submitter_info[key])) missing.push(label);
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

  if (!hasValue(enriched.file_url) && !hasValue(enriched.proposal_file_url)) {
    missing.push('Proposal File');
  }

  if (!hasValue(enriched.side)) missing.push('Side');
  else if (!['side_a', 'side_b'].includes(enriched.side)) {
    missing.push('Side must be side_a or side_b');
  }

  return missing;
}

function validateMmSideBSubmit(proposal) {
  const enriched = enrichMmProposalRow(proposal);
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

  if (!hasValue(enriched.country)) missing.push('Country');

  Object.entries({
    entity_type: 'Organization — Entity Type',
    organization_name: 'Organization — Name',
    contact_name: 'Contact — Full Name',
    email: 'Contact — Email',
    phone: 'Contact — Phone',
    country: 'Organization — Country',
  }).forEach(([key, label]) => {
    if (!hasValue(enriched.submitter_info[key])) missing.push(label);
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

  if (!hasValue(enriched.file_url) && !hasValue(enriched.proposal_file_url)) {
    missing.push('Proposal File');
  }

  if (!hasValue(enriched.side)) missing.push('Side');
  else if (enriched.side !== 'side_b') {
    missing.push('Side B proposals must use side_b');
  }

  return missing;
}

function validateMmProposalSubmit(proposal) {
  const enriched = enrichMmProposalRow(proposal);
  if (enriched.side === 'side_b') {
    return validateMmSideBSubmit(enriched);
  }
  return validateMmSideASubmit(enriched);
}

function buildEngagementRowFromMatch(sideA, sideB, sideAUser, sideBUser, matcherId) {
  const a = enrichMmProposalRow(sideA);
  const b = enrichMmProposalRow(sideB);

  const partyAInfo = {
    ...a.submitter_info,
    country: a.country || a.submitter_info.country || sideAUser?.country || 'Pakistan',
  };

  const contactInfo = {
    ...a.contact_info,
    name: a.contact_info.name || partyAInfo.contact_name,
    email: a.contact_info.email || partyAInfo.email,
    cell: a.contact_info.cell || partyAInfo.phone,
  };

  const bInfo = b.submitter_info || {};

  return {
    party_a_id: sideA.submitted_by,
    engagement_type: a.engagement_type || 'B2B',
    conference_info: a.conference_info,
    party_a_info: partyAInfo,
    executive_summary: a.executive_summary,
    company_overview: a.company_overview,
    project_overview: a.project_overview,
    financials: a.financials,
    investment_ask: a.investment_ask,
    contact_info: contactInfo,
    sector: a.sector,
    project_type: a.project_type,
    company_name: a.company_name || sideAUser?.organization || a.title,
    venture_name: a.venture_name || a.title,
    proposal_title: a.venture_name || a.title,
    proposal_description:
      a.description || a.executive_summary?.project_overview || b.description || '',
    proposal_file_url: a.proposal_file_url || b.proposal_file_url || null,
    company_logo_url: a.company_logo_url || null,
    cover_image_url: a.cover_image_url || null,
    party_b_entity_type: bInfo.entity_type || 'business',
    party_b_name: bInfo.contact_name || sideBUser?.full_name || '',
    party_b_organization: bInfo.organization_name || sideBUser?.organization || '',
    party_b_email: bInfo.email || sideBUser?.email || '',
    party_b_phone: bInfo.phone || sideBUser?.phone || '',
    party_b_country: b.country || bInfo.country || sideBUser?.country || '',
    status: 'approved',
    reviewed_by: matcherId,
    reviewed_at: new Date(),
    submitted_at: sideA.created_at,
  };
}

module.exports = {
  MM_TABLE_FIELDS,
  MM_KEYWORD_SCALAR_FIELDS,
  MM_KEYWORD_JSON_FIELDS,
  parseMmKeywords,
  enrichMmProposalRow,
  buildMmProposalDraftUpdates,
  validateMmProposalSubmit,
  validateMmSideASubmit,
  validateMmSideBSubmit,
  buildEngagementRowFromMatch,
  hasMeaningfulMmDraft,
  enrichProposalRow,
};

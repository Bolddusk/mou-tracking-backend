const pool = require('../config/db');
const { enrichProposalRow } = require('./proposalTemplate');
const { resolveMouLifecycle } = require('./mouLifecycle');

const PROPOSAL_SELECT = `
  SELECT
    p.*,
    pa.organization AS party_a_organization
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
`;

const CATEGORY_ORDER = {
  '1. Investment': 1,
  '2. Trade': 2,
  '3. Training': 3,
};

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseUsdM(value) {
  if (value === null || value === undefined || value === '') return 0;
  const raw = String(value).trim();
  if (/undisclosed/i.test(raw)) return 0;
  const num = Number(raw.replace(/,/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function displayText(value, fallback = '—') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function displayTimeline(value) {
  const text = displayText(value, '');
  if (!text) return 'Not specified';
  if (/^nil$/i.test(text)) return 'Nil';
  return text;
}

function formatMultiline(value) {
  const text = displayText(value, '—');
  if (text === '—') return text;
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.startsWith('•') ? line : `• ${line}`))
    .join('\n');
}

function normalizeSubCategory(tail) {
  const t = String(tail || '').trim();
  if (!t) return 'General';
  const lower = t.toLowerCase();
  if (lower.includes('export oriented') || lower === 'export') return 'Export oriented';
  if (lower.includes('import reduction')) return 'Import Reduction';
  if (lower.includes('import')) return t;
  return t;
}

function parseSifcCategory(raw) {
  const source = String(raw || '').trim();
  if (!source) {
    return {
      category: 'Other',
      category_order: 99,
      sub_category: 'General',
      raw: null,
    };
  }

  const parts = source.split(/[–—-]/).map((part) => part.trim()).filter(Boolean);
  const head = (parts[0] || '').toLowerCase();
  const tail = parts.slice(1).join(' – ');

  if (head.startsWith('investment')) {
    return {
      category: '1. Investment',
      category_order: CATEGORY_ORDER['1. Investment'],
      sub_category: normalizeSubCategory(tail),
      raw: source,
    };
  }
  if (head.startsWith('trade')) {
    return {
      category: '2. Trade',
      category_order: CATEGORY_ORDER['2. Trade'],
      sub_category: normalizeSubCategory(tail),
      raw: source,
    };
  }
  if (head.startsWith('training')) {
    return {
      category: '3. Training',
      category_order: CATEGORY_ORDER['3. Training'],
      sub_category: normalizeSubCategory(tail),
      raw: source,
    };
  }

  return {
    category: parts[0] || 'Other',
    category_order: 50,
    sub_category: normalizeSubCategory(tail),
    raw: source,
  };
}

function getOperationalBucket(proposal) {
  const exec = proposal.executive_summary || {};
  const raw = String(exec.mou_operational_status || '').toLowerCase();

  if (raw.includes('execution')) return 'in_execution';
  if (raw === 'inactive' || exec.collaboration_dropped) return 'inactive';
  if (raw === 'active') return 'active';

  const lifecycle = resolveMouLifecycle(proposal);
  if (lifecycle === 'execution') return 'in_execution';
  if (lifecycle === 'inactive') return 'inactive';
  return 'active';
}

function emptyBucket() {
  return { count: 0, amount_usd_m: 0 };
}

function addBucket(bucket, amountUsd) {
  bucket.count += 1;
  bucket.amount_usd_m = round2(bucket.amount_usd_m + amountUsd);
}

function mergeBuckets(target, source) {
  target.count += source.count;
  target.amount_usd_m = round2(target.amount_usd_m + source.amount_usd_m);
}

function buildValueLabel(valueUsd, parsed, rawSifc) {
  const label = parsed.sub_category || rawSifc || '';
  if (!valueUsd) {
    return label ? `Undisclosed (${label})` : 'Undisclosed';
  }
  return label ? `${valueUsd} (${label})` : String(valueUsd);
}

function extractOutcome(proposal) {
  const exec = proposal.executive_summary || {};
  if (exec.project_overview) return exec.project_overview;
  const desc = String(proposal.proposal_description || '').split('\n\n')[0];
  return desc || proposal.mou_description || '';
}

function buildDetailRow(proposal, sr, bucket) {
  const exec = proposal.executive_summary || {};
  const partyA = proposal.party_a_info || {};
  const parsed = parseSifcCategory(exec.sifc_category);
  const valueUsd = parseUsdM(proposal.investment_value_usd);
  const hasNumericValue = valueUsd > 0;

  const base = {
    sr,
    proposal_id: proposal.id,
    pak_company: displayText(proposal.company_name || partyA.organization_name),
    chinese_company: displayText(proposal.party_b_name),
    mou_value_usd_m: hasNumericValue ? valueUsd : null,
    value_label: buildValueLabel(hasNumericValue ? valueUsd : 0, parsed, exec.sifc_category),
    location: displayText(exec.location),
    tentative_timeline: displayTimeline(exec.tentative_timeline),
    status_feedback: formatMultiline(exec.progress),
    sector: proposal.sector || null,
    agreement_type: proposal.cooperation_mode || 'mou',
  };

  if (bucket === 'in_execution') {
    return {
      ...base,
      outcome: displayText(extractOutcome(proposal)),
      action_taken: displayText(exec.action_taken, 'No issue was reported'),
    };
  }

  return {
    ...base,
    product: displayText(exec.project_overview || proposal.mou_sub_sector || proposal.mou_scope),
    bottlenecks: displayText(exec.bottlenecks, 'Nil'),
  };
}

function compareProposals(a, b) {
  const srA = Number(a.executive_summary?.source_sr_no);
  const srB = Number(b.executive_summary?.source_sr_no);
  if (Number.isFinite(srA) && Number.isFinite(srB) && srA !== srB) return srA - srB;
  return Number(a.id) - Number(b.id);
}

function snapshotRowKey(category, subCategory, agreementType) {
  return `${category}||${subCategory}||${agreementType}`;
}

function buildSnapshotRows(proposals) {
  const groups = new Map();

  for (const proposal of proposals) {
    const exec = proposal.executive_summary || {};
    const parsed = parseSifcCategory(exec.sifc_category);
    const agreementType = proposal.cooperation_mode || 'mou';
    const key = snapshotRowKey(parsed.category, parsed.sub_category, agreementType);
    const bucketName = getOperationalBucket(proposal);
    const valueUsd = parseUsdM(proposal.investment_value_usd);

    if (!groups.has(key)) {
      groups.set(key, {
        category: parsed.category,
        category_order: parsed.category_order,
        sub_category: parsed.sub_category,
        agreement_type: agreementType,
        total_count: 0,
        total_value_usd_m: 0,
        in_execution: emptyBucket(),
        active: emptyBucket(),
        inactive: emptyBucket(),
        row_type: 'data',
      });
    }

    const row = groups.get(key);
    row.total_count += 1;
    row.total_value_usd_m = round2(row.total_value_usd_m + valueUsd);
    addBucket(row[bucketName], valueUsd);
  }

  const dataRows = [...groups.values()].sort((a, b) => {
    if (a.category_order !== b.category_order) return a.category_order - b.category_order;
    const sub = a.sub_category.localeCompare(b.sub_category);
    if (sub !== 0) return sub;
    return a.agreement_type.localeCompare(b.agreement_type);
  });

  const rows = [];
  let currentCategory = null;
  let categorySubtotal = null;

  function flushSubtotal() {
    if (!categorySubtotal) return;
    rows.push({
      row_type: 'subtotal',
      category: currentCategory,
      label: 'Subtotal',
      total_count: categorySubtotal.total_count,
      total_value_usd_m: round2(categorySubtotal.total_value_usd_m),
      in_execution: { ...categorySubtotal.in_execution },
      active: { ...categorySubtotal.active },
      inactive: { ...categorySubtotal.inactive },
    });
    categorySubtotal = null;
  }

  for (const row of dataRows) {
    if (row.category !== currentCategory) {
      flushSubtotal();
      currentCategory = row.category;
      categorySubtotal = {
        total_count: 0,
        total_value_usd_m: 0,
        in_execution: emptyBucket(),
        active: emptyBucket(),
        inactive: emptyBucket(),
      };
    }

    rows.push(row);
    categorySubtotal.total_count += row.total_count;
    categorySubtotal.total_value_usd_m = round2(categorySubtotal.total_value_usd_m + row.total_value_usd_m);
    mergeBuckets(categorySubtotal.in_execution, row.in_execution);
    mergeBuckets(categorySubtotal.active, row.active);
    mergeBuckets(categorySubtotal.inactive, row.inactive);
  }
  flushSubtotal();

  const grand = {
    row_type: 'grand_total',
    label: 'Grand Total',
    total_count: 0,
    total_value_usd_m: 0,
    in_execution: emptyBucket(),
    active: emptyBucket(),
    inactive: emptyBucket(),
  };

  for (const row of dataRows) {
    grand.total_count += row.total_count;
    grand.total_value_usd_m = round2(grand.total_value_usd_m + row.total_value_usd_m);
    mergeBuckets(grand.in_execution, row.in_execution);
    mergeBuckets(grand.active, row.active);
    mergeBuckets(grand.inactive, row.inactive);
  }

  rows.push(grand);
  return rows;
}

function buildSections(proposals) {
  const sections = {
    in_execution: [],
    active: [],
    inactive: [],
  };

  const sorted = [...proposals].sort(compareProposals);
  const counters = { in_execution: 0, active: 0, inactive: 0 };

  for (const proposal of sorted) {
    const bucket = getOperationalBucket(proposal);
    counters[bucket] += 1;
    sections[bucket].push(buildDetailRow(proposal, counters[bucket], bucket));
  }

  return sections;
}

async function fetchConferenceProposals(conferenceKey, sectorScopes = null) {
  const params = [conferenceKey];
  let sql = `${PROPOSAL_SELECT}
    WHERE p.conference_key = ?
      AND p.status != 'draft'`;

  if (sectorScopes?.length) {
    sql += ` AND p.sector IN (${sectorScopes.map(() => '?').join(', ')})`;
    params.push(...sectorScopes);
  }

  sql += ' ORDER BY p.id ASC';

  const [rows] = await pool.query(sql, params);
  return rows.map((row) => enrichProposalRow(row));
}

async function buildConferenceReport(conference, { sectorScopes = null, scope = {} } = {}) {
  const proposals = await fetchConferenceProposals(conference.key, sectorScopes);
  const sections = buildSections(proposals);

  return {
    conference: {
      key: conference.key,
      name: conference.name,
      report_title: conference.report_title || conference.name,
    },
    scope,
    generated_at: new Date().toISOString(),
    proposal_count: proposals.length,
    summary_counts: {
      in_execution: sections.in_execution.length,
      active: sections.active.length,
      inactive: sections.inactive.length,
    },
    snapshot: {
      rows: buildSnapshotRows(proposals),
    },
    sections,
  };
}

module.exports = {
  buildConferenceReport,
  fetchConferenceProposals,
  parseSifcCategory,
  getOperationalBucket,
  parseUsdM,
};

const path = require('path');
const fs = require('fs');
const { buildConferenceInfo } = require('../constants/conferences');
const { normalizeCooperationMode } = require('../constants/cooperationModes');
const {
  cleanCompanyName,
  normalizeCompanyPair,
  buildVentureTitle,
  buildOutcomeDescription,
} = require('./mouImportHelpers');
const { normalizeSectorName, normalizeSifcCategory } = require('./portfolioNormalize');

function parseMouValue(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }

  const text = String(raw).trim();
  if (!text || /^not\s*specified$/i.test(text) || /^undisclosed$/i.test(text)) return null;
  if (/^value\s+not\s+specified$/i.test(text)) return null;

  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (match) return match[1];
  return null;
}

function buildExternalReference(prefix, seq) {
  return `${prefix}-MOU-${String(seq).padStart(3, '0')}`;
}

function normalizeConferenceRow(raw, seq, conferenceConfig) {
  const status = String(raw.Status || raw.status || 'Active').trim();
  const statusLower = status.toLowerCase();
  const cooperationMode = normalizeCooperationMode(raw['Cooperation Mode'] || raw.cooperation_mode) || 'mou';
  const sector = normalizeSectorName(raw.Sector || raw.sector);
  const sifcCategory = normalizeSifcCategory(raw['SIFC Category'] || raw.sifc_category);
  const pair = normalizeCompanyPair(
    raw['Chinese company'] || raw.chinese_company,
    raw['Pakistani company'] || raw.pakistani_company
  );
  const chineseCompany = pair.chinese;
  const pakistaniCompany = pair.pakistani;

  return {
    seq,
    sr_no: raw['Sr. No'] ?? raw.sr_no ?? seq,
    external_reference: buildExternalReference(conferenceConfig.ref_prefix, seq),
    chinese_company: chineseCompany,
    pakistani_company: pakistaniCompany,
    sifc_category: sifcCategory,
    sector,
    cooperation_mode: cooperationMode,
    investment_value_usd: parseMouValue(raw['MoU Value'] ?? raw.mou_value),
    outcome_description: String(raw['Outcome / Description'] || raw.outcome_description || '').trim(),
    operational_status: status,
    progress: String(raw.Progress || raw.progress || '').trim(),
    bottleneck: String(raw.Bottleneck || raw.bottleneck || '').trim(),
    tentative_timelines: String(raw['Tentative Timelines'] || raw.tentative_timelines || '').trim(),
    collaboration_dropped: statusLower === 'inactive',
    in_execution: statusLower.includes('execution'),
    venture_name: buildVentureTitle(chineseCompany, pakistaniCompany),
    conference_key: conferenceConfig.key,
    conference_name: conferenceConfig.name,
    submitted_at: conferenceConfig.submitted_at,
  };
}

function loadConferenceMouRows(jsonPath, conferenceConfig) {
  const absolutePath = path.resolve(jsonPath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const rows = payload.records || payload.mous || (Array.isArray(payload) ? payload : null);
  if (!Array.isArray(rows)) {
    throw new Error(`Expected records array in ${absolutePath}`);
  }
  return rows.map((row, index) => normalizeConferenceRow(row, index + 1, conferenceConfig));
}

function buildProposalRecord(row, partyAId, sectorLeadId, conferenceConfig) {
  const submittedAt = new Date(row.submitted_at || conferenceConfig.submitted_at);
  const conferenceShape = {
    key: conferenceConfig.key,
    name: conferenceConfig.name,
    date: conferenceConfig.date,
    end_date: conferenceConfig.end_date,
    location: conferenceConfig.location,
    host: conferenceConfig.host,
    description: conferenceConfig.description,
  };
  const conferenceInfo = buildConferenceInfo(conferenceShape, {
    description: conferenceConfig.description,
  });
  const fullDescription = buildOutcomeDescription(row);
  const investmentLabel = row.investment_value_usd
    ? `USD ${row.investment_value_usd} million`
    : '';

  return {
    party_a_id: partyAId,
    engagement_type: conferenceConfig.engagement_type || 'B2B',
    cooperation_mode: row.cooperation_mode,
    conference_key: conferenceConfig.key,
    conference_name: conferenceConfig.name,
    external_reference: row.external_reference,
    investment_value_usd: row.investment_value_usd,
    mou_sub_sector: row.sector,
    jurisdiction: null,
    signed_copy_status: null,
    conference_info: JSON.stringify(conferenceInfo),
    party_a_info: JSON.stringify({
      entity_type: 'business',
      organization_name: row.pakistani_company,
      contact_name: row.pakistani_company,
      designation: '',
      email: '',
      phone: '',
      country: 'Pakistan',
      city: '',
    }),
    party_b_entity_type: 'business',
    sector: row.sector,
    company_name: row.pakistani_company,
    venture_name: row.venture_name,
    proposal_title: row.venture_name,
    project_type: 'Greenfield',
    executive_summary: JSON.stringify({
      company_overview: row.pakistani_company,
      project_overview: row.outcome_description,
      project_segment: row.sector,
      sector_alignment: row.sector,
      investment_ask_summary: investmentLabel,
      sifc_category: row.sifc_category || null,
      mou_operational_status: row.operational_status,
      current_status: row.progress || row.operational_status,
      progress: row.progress || null,
      bottlenecks: row.bottleneck || null,
      tentative_timeline: row.tentative_timelines || null,
      collaboration_type: row.cooperation_mode.toUpperCase(),
      collaboration_dropped: row.collaboration_dropped,
      in_execution: row.in_execution,
      source_sr_no: row.sr_no,
      source_seq: row.seq,
    }),
    proposal_description: fullDescription,
    party_b_name: row.chinese_company,
    party_b_organization: row.chinese_company,
    party_b_email: null,
    party_b_phone: null,
    party_b_country: 'China',
    mou_scope: row.sector,
    mou_description: fullDescription,
    mou_sector: row.sector,
    mou_demand: investmentLabel || null,
    mou_status: 'uploaded',
    mou_ack_exempt: 1,
    mou_ack_by_a: 1,
    mou_ack_by_a_at: submittedAt,
    mou_ack_by_b: 1,
    mou_ack_by_b_at: submittedAt,
    status: 'approved',
    reviewed_by: sectorLeadId,
    reviewed_at: submittedAt,
    submitted_at: submittedAt,
  };
}

module.exports = {
  loadConferenceMouRows,
  buildProposalRecord,
  parseMouValue,
  normalizeSectorName,
  normalizeSifcCategory,
};

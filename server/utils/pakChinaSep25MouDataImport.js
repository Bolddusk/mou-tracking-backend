const path = require('path');
const fs = require('fs');
const { PAK_CHINA_SEP_25_CONFERENCE, buildConferenceInfo } = require('../constants/conferences');
const { normalizeCooperationMode } = require('../constants/cooperationModes');
const {
  mapAgriSubSectorToPortalSector,
  parseMouValue,
} = require('./islamabadAgriMouDataImport');

const DEFAULT_JSON_PATH = path.join(
  __dirname,
  '..',
  '..',
  'Pak-China-MoUs-Consolidated-Jul2026.json'
);

function buildExternalReference(seq) {
  return `PAK-CHINA-SEP25-MOU-${String(seq).padStart(3, '0')}`;
}

function buildVentureTitle(chineseCompany, pakistaniCompany) {
  const title = `${chineseCompany} × ${pakistaniCompany}`;
  return title.length > 250 ? `${title.slice(0, 247)}...` : title;
}

function buildFullDescription(row) {
  const parts = [row.outcome_description];
  if (row.sifc_category) parts.push(`SIFC category: ${row.sifc_category}`);
  if (row.progress) parts.push(`Progress: ${row.progress}`);
  if (row.bottleneck) parts.push(`Bottleneck: ${row.bottleneck}`);
  if (row.tentative_timelines) parts.push(`Tentative timelines: ${row.tentative_timelines}`);
  if (row.operational_status === 'Inactive') parts.push('Collaboration status: Inactive');
  if (row.operational_status === 'In Execution') parts.push('Collaboration status: In Execution');
  return parts.filter(Boolean).join('\n\n');
}

function normalizeConsolidatedRow(raw, seq) {
  const status = String(raw.Status || raw.status || 'Active').trim();
  const statusLower = status.toLowerCase();
  const cooperationMode = normalizeCooperationMode(raw['Cooperation Mode'] || raw.cooperation_mode) || 'mou';

  return {
    seq,
    sr_no: raw['Sr. No'] ?? raw.sr_no ?? seq,
    external_reference: buildExternalReference(seq),
    chinese_company: String(raw['Chinese company'] || raw.chinese_company || '').trim(),
    pakistani_company: String(raw['Pakistani company'] || raw.pakistani_company || '').trim(),
    sifc_category: String(raw['SIFC Category'] || raw.sifc_category || '').trim(),
    mou_sub_sector: String(raw['Agriculture Sub-Sector'] || raw.agriculture_sub_sector || '').trim(),
    sector: mapAgriSubSectorToPortalSector(raw['Agriculture Sub-Sector'] || raw.agriculture_sub_sector),
    cooperation_mode: cooperationMode,
    investment_value_usd: parseMouValue(raw['MoU Value'] ?? raw.mou_value),
    outcome_description: String(raw['Outcome / Description'] || raw.outcome_description || '').trim(),
    operational_status: status,
    progress: String(raw.Progress || raw.progress || '').trim(),
    bottleneck: String(raw.Bottleneck || raw.bottleneck || '').trim(),
    tentative_timelines: String(raw['Tentative Timelines'] || raw.tentative_timelines || '').trim(),
    collaboration_dropped: statusLower === 'inactive',
    in_execution: statusLower.includes('execution'),
    venture_name: buildVentureTitle(
      raw['Chinese company'] || raw.chinese_company,
      raw['Pakistani company'] || raw.pakistani_company
    ),
  };
}

function loadPakChinaSep25MouRows(jsonPath = DEFAULT_JSON_PATH) {
  const absolutePath = path.resolve(jsonPath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const rows = Array.isArray(payload) ? payload : payload.mous;
  if (!Array.isArray(rows)) {
    throw new Error(`Expected mous array in ${absolutePath}`);
  }
  return rows.map((row, index) => normalizeConsolidatedRow(row, index + 1));
}

function buildProposalRecord(row, partyAId, sectorLeadId) {
  const submittedAt = new Date('2025-09-15T10:00:00.000Z');
  const conferenceInfo = buildConferenceInfo(PAK_CHINA_SEP_25_CONFERENCE, {
    description: `Historic ${row.cooperation_mode.toUpperCase()} imported from Pak-China Sep-25 consolidated dataset (Seq ${row.seq}, Sr ${row.sr_no}).`,
  });
  const fullDescription = buildFullDescription(row);
  const investmentLabel = row.investment_value_usd
    ? `USD ${row.investment_value_usd} million`
    : '';

  return {
    party_a_id: partyAId,
    engagement_type: 'B2B',
    cooperation_mode: row.cooperation_mode,
    conference_key: PAK_CHINA_SEP_25_CONFERENCE.key,
    conference_name: PAK_CHINA_SEP_25_CONFERENCE.name,
    external_reference: row.external_reference,
    investment_value_usd: row.investment_value_usd,
    mou_sub_sector: row.mou_sub_sector,
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
      project_segment: row.mou_sub_sector,
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
    mou_scope: row.mou_sub_sector,
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
  DEFAULT_JSON_PATH,
  loadPakChinaSep25MouRows,
  buildProposalRecord,
  buildExternalReference,
};

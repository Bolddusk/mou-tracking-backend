const path = require('path');
const { ISLAMABAD_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');
const { normalizeCooperationMode } = require('../constants/cooperationModes');
const { mapSubSectorToPortalSector } = require('./agriMouImport');

const DEFAULT_JSON_PATH = path.join(__dirname, '..', '..', 'mou_data.json');

function mapAgriSubSectorToPortalSector(subSector) {
  const value = String(subSector || '').trim().toLowerCase();

  if (value.includes('agro chemical') || value.includes('agricultural input')) {
    return 'Agri-chemicals & Inputs';
  }
  if (value.includes('dairy')) {
    return 'Dairy Inputs & Processed Dairy Products';
  }
  if (value.includes('meat') || value.includes('poultry')) {
    return 'Meat & Poultry Industry';
  }
  if (value.includes('fruit') || value.includes('vegetable')) {
    return 'Fruits & Vegetables (Production, Cultivation, Processing, Exports)';
  }
  if (value.includes('fisheries') || value.includes('aquaculture')) {
    return 'Fisheries & Aquaculture (Including Processing)';
  }
  if (value.includes('animal feed')) {
    return 'Animal Feed & Related Value Chains';
  }
  if (value.includes('cold chain') || value.includes('agri logistics')) {
    return 'Cold Chain Systems & Agriculture Logistics';
  }
  if (value.includes('food processing') || value.includes('value addition')) {
    return 'Food Processing & Value Addition';
  }
  if (
    value.includes('technology') ||
    value.includes('smart farming') ||
    value.includes('precision')
  ) {
    return 'Agri Technology & Precision Agriculture Solutions';
  }
  if (value.includes('cross-cutting') || value.includes('general /')) {
    return 'Agri Technology & Precision Agriculture Solutions';
  }

  return mapSubSectorToPortalSector(subSector);
}

function parseMouValue(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }

  const text = String(raw).trim();
  if (!text || /^not\s*specified$/i.test(text) || /^undisclosed$/i.test(text)) return null;

  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (match) return match[1];
  return text;
}

function buildExternalReference(seq) {
  return `ISLAMABAD-AGRI-MOU-${String(seq).padStart(3, '0')}`;
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
  if (row.status === 'Inactive') parts.push('Collaboration status: Inactive');
  return parts.filter(Boolean).join('\n\n');
}

function normalizeMouRow(raw, seq) {
  const cooperationMode = normalizeCooperationMode(raw.cooperation_mode) || 'mou';
  const isInactive = String(raw.status || '').trim().toLowerCase() === 'inactive';

  return {
    seq,
    sr_no: raw.sr_no,
    external_reference: buildExternalReference(seq),
    chinese_company: String(raw.chinese_company || '').trim(),
    pakistani_company: String(raw.pakistani_company || '').trim(),
    sifc_category: String(raw.sifc_category || '').trim(),
    mou_sub_sector: String(raw.agriculture_sub_sector || '').trim(),
    sector: mapAgriSubSectorToPortalSector(raw.agriculture_sub_sector),
    cooperation_mode: cooperationMode,
    investment_value_usd: parseMouValue(raw.mou_value),
    outcome_description: String(raw.outcome_description || '').trim(),
    operational_status: String(raw.status || 'Active').trim(),
    progress: String(raw.progress || '').trim(),
    bottleneck: String(raw.bottleneck || '').trim(),
    tentative_timelines: String(raw.tentative_timelines || '').trim(),
    collaboration_dropped: isInactive,
    venture_name: buildVentureTitle(raw.chinese_company, raw.pakistani_company),
  };
}

function loadIslamabadMouDataRows(jsonPath = DEFAULT_JSON_PATH) {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const rows = require(jsonPath);
  if (!Array.isArray(rows)) {
    throw new Error(`Expected array in ${jsonPath}`);
  }
  return rows.map((row, index) => normalizeMouRow(row, index + 1));
}

function buildProposalRecord(row, partyAId, sectorLeadId) {
  const submittedAt = new Date('2026-06-12T10:00:00.000Z');
  const conferenceInfo = buildConferenceInfo(ISLAMABAD_AGRI_2026, {
    description: `Historic ${row.cooperation_mode.toUpperCase()} imported from Islamabad Agri MOU dataset (Seq ${row.seq}, Sr ${row.sr_no}).`,
  });
  const fullDescription = buildFullDescription(row);
  const investmentLabel = row.investment_value_usd
    ? `USD ${row.investment_value_usd} million`
    : '';

  return {
    party_a_id: partyAId,
    engagement_type: 'B2B',
    cooperation_mode: row.cooperation_mode,
    conference_key: ISLAMABAD_AGRI_2026.key,
    conference_name: ISLAMABAD_AGRI_2026.name,
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
  loadIslamabadMouDataRows,
  buildProposalRecord,
  mapAgriSubSectorToPortalSector,
  parseMouValue,
  buildExternalReference,
};

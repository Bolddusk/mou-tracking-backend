const { ISLAMABAD_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');

const MOU_SUB_SECTOR = 'Fruits & Vegetables Cultivation, Packaging, Processing & Exports';
const PORTAL_SECTOR =
  'Fruits & Vegetables (Production, Cultivation, Processing, Exports)';

const ISLAMABAD_AGRI_FRUIT_ROWS = [
  {
    sr: '1',
    chinese_company: 'Shanghai You Tong Int. Trading Co., Ltd',
    pakistani_company: 'Al-Mahmood Establishment',
    cooperation_mode_raw: 'JV/Bilateral Trade',
    investment_value_usd: '1',
    description: 'Exchange of citrus plants with mango fruit between China and Pakistan',
  },
  {
    sr: '2',
    chinese_company: 'Yizewanjio Supply Chain Guangxi',
    pakistani_company: 'Al-Mahmood Establishment',
    cooperation_mode_raw: 'JV/Export oriented trade',
    investment_value_usd: '1.5',
    description: 'Establishment of seedless citrus orchard in Pakistan',
  },
];

function mapCooperationMode(raw) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('jv')) return 'jv';
  if (value.includes('100%') && value.includes('equity')) return 'agreement';
  return 'mou';
}

function buildExternalReference(sr) {
  return `ISLAMABAD-AGRI-FRUIT-${sr}`;
}

function buildVentureTitle(chineseCompany, pakistaniCompany) {
  const title = `${chineseCompany} × ${pakistaniCompany}`;
  return title.length > 250 ? `${title.slice(0, 247)}...` : title;
}

function getIslamabadAgriFruitRows() {
  return ISLAMABAD_AGRI_FRUIT_ROWS.map((row) => ({
    ...row,
    external_reference: buildExternalReference(row.sr),
    mou_sub_sector: MOU_SUB_SECTOR,
    sector: PORTAL_SECTOR,
    cooperation_mode: mapCooperationMode(row.cooperation_mode_raw),
    venture_name: buildVentureTitle(row.chinese_company, row.pakistani_company),
    signed_copy_status: null,
    jurisdiction: null,
  }));
}

function buildProposalRecord(row, partyAId, sectorLeadId) {
  const submittedAt = new Date('2026-06-12T10:00:00.000Z');
  const conferenceInfo = buildConferenceInfo(ISLAMABAD_AGRI_2026, {
    description: `Historic ${row.cooperation_mode.toUpperCase()} imported from Islamabad Fruits & Vegetables list (Sr ${row.sr}).`,
  });

  return {
    party_a_id: partyAId,
    engagement_type: 'B2B',
    cooperation_mode: row.cooperation_mode,
    conference_key: ISLAMABAD_AGRI_2026.key,
    conference_name: ISLAMABAD_AGRI_2026.name,
    external_reference: row.external_reference,
    investment_value_usd: row.investment_value_usd,
    mou_sub_sector: row.mou_sub_sector,
    jurisdiction: row.jurisdiction,
    signed_copy_status: row.signed_copy_status,
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
      project_overview: row.description,
      project_segment: row.mou_sub_sector,
      sector_alignment: row.sector,
      investment_ask_summary: row.investment_value_usd
        ? `USD ${row.investment_value_usd} million`
        : '',
      cooperation_type: row.cooperation_mode_raw,
    }),
    proposal_description: row.description,
    party_b_name: row.chinese_company,
    party_b_organization: row.chinese_company,
    party_b_email: null,
    party_b_phone: null,
    party_b_country: 'China',
    mou_scope: row.mou_sub_sector,
    mou_description: row.description,
    mou_sector: row.sector,
    mou_demand: row.investment_value_usd
      ? `Estimated value: USD ${row.investment_value_usd} million`
      : null,
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
  ISLAMABAD_AGRI_FRUIT_ROWS,
  getIslamabadAgriFruitRows,
  buildProposalRecord,
  buildExternalReference,
};

const { ISLAMABAD_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');

const MOU_SUB_SECTOR = 'Cold Chain and Agricultural Logistics';
const PORTAL_SECTOR = 'Cold Chain Systems & Agriculture Logistics';

const ISLAMABAD_AGRI_COLD_CHAIN_ROWS = [
  {
    sr: '1',
    chinese_company: 'Dongying Fengtu Intelligent Storage Co Ltd (FT SILO)',
    pakistani_company: 'United Resources Corporation',
    cooperation_mode_raw: 'Investment/JV',
    investment_value_usd: '6.5',
    description: 'Construction of Grain Storage and Silos',
  },
  {
    sr: '2',
    chinese_company: 'Dongying Fengtu Intelligent Storage Co Ltd (FT SILO)',
    pakistani_company: 'Chani Khan Rice Mill',
    cooperation_mode_raw: 'Investment/JV',
    investment_value_usd: '20',
    description: 'Construction of Grain Storage and Silos',
  },
  {
    sr: '3',
    chinese_company: 'Dongying Fengtu Intelligent Storage Co Ltd (FT SILO)',
    pakistani_company: 'Mahmood Traders',
    cooperation_mode_raw: 'Investment/JV',
    investment_value_usd: '20',
    description: 'Construction of Grain Storage and Silos',
  },
  {
    sr: '4',
    chinese_company: 'Dongying Fengtu Intelligent Storage Co Ltd (FT SILO)',
    pakistani_company: 'Chopal Traders',
    cooperation_mode_raw: 'Investment/JV',
    investment_value_usd: '25',
    description: 'Construction of Grain Storage and Silos',
  },
  {
    sr: '5',
    chinese_company: 'Wang Chuang Xi Jun Chang Agri Ltd. Company',
    pakistani_company: 'Zaren Ltd',
    cooperation_mode_raw: 'Investment/JV',
    investment_value_usd: '2',
    description: 'Construction of Grain Storage and Warehouse',
  },
  {
    sr: '6',
    chinese_company: 'Commercial Venture',
    pakistani_company: 'Khalis Bunca',
    cooperation_mode_raw: 'Investment/JV',
    investment_value_usd: '0.07',
    description: 'Construction of Cold Storage and Value addition',
  },
  {
    sr: '7',
    chinese_company: 'Zhaoqing Jinchuang huinong Agricultural Development Co Ltd',
    pakistani_company: 'Khalis Bunca',
    cooperation_mode_raw: 'Investment/JV',
    investment_value_usd: '1',
    description: 'Construction of Cold Storage and Value addition',
  },
];

function mapCooperationMode(raw) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('jv')) return 'jv';
  return 'mou';
}

function buildExternalReference(sr) {
  return `ISLAMABAD-AGRI-COLDCHAIN-${sr}`;
}

function buildVentureTitle(chineseCompany, pakistaniCompany) {
  const title = `${chineseCompany} × ${pakistaniCompany}`;
  return title.length > 250 ? `${title.slice(0, 247)}...` : title;
}

function getIslamabadAgriColdChainRows() {
  return ISLAMABAD_AGRI_COLD_CHAIN_ROWS.map((row) => ({
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
    description: `Historic ${row.cooperation_mode.toUpperCase()} imported from Islamabad Cold Chain list (Sr ${row.sr}).`,
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
  ISLAMABAD_AGRI_COLD_CHAIN_ROWS,
  getIslamabadAgriColdChainRows,
  buildProposalRecord,
  buildExternalReference,
};

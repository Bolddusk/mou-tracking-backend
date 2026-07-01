const { ISLAMABAD_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');

const MOU_SUB_SECTOR = 'Agriculture Technology and Precision Agriculture Solutions';
const PORTAL_SECTOR = 'Agri Technology & Precision Agriculture Solutions';

const ISLAMABAD_AGRI_TECH_ROWS = [
  {
    sr: '1',
    chinese_company: 'Alpha AI Technology Ltd.',
    pakistani_company: 'The University of Faisalabad',
    cooperation_mode_raw: 'Import Reduction/Investment',
    investment_value_usd: '10',
    description: 'Precision machinery and equipment',
  },
  {
    sr: '2',
    chinese_company: 'WAS Technology Solutions Co. Ltd.',
    pakistani_company: 'Biogas and Renewable Energy Technology (BRET)',
    cooperation_mode_raw: 'Investment/Trade/JV',
    investment_value_usd: '5',
    description: 'Renewable technologies & irrigation equip.',
  },
  {
    sr: '3',
    chinese_company: 'Huida Technology, Co., Ltd.',
    pakistani_company: 'Al Karam Farm Technologies, Pvt., Ltd.',
    cooperation_mode_raw: 'Investment/Import (Consumption)',
    investment_value_usd: '5',
    description: 'Precision farm machinery',
  },
  {
    sr: '4',
    chinese_company: 'Zoomlion',
    pakistani_company: 'Al Karam Farm Technologies, Pvt., Ltd.',
    cooperation_mode_raw: 'Import Reduction/Investment',
    investment_value_usd: '5',
    description: 'Precision farm machinery',
  },
  {
    sr: '5',
    chinese_company: 'Heida Foods, Co., Ltd.',
    pakistani_company: 'Walnut Poultry Farm, Pvt., Ltd.',
    cooperation_mode_raw: 'Import Reduction/Investment',
    investment_value_usd: '50',
    description: 'Poultry machinery and technologies',
  },
  {
    sr: '6',
    chinese_company: 'Alpha AI Technology Ltd.',
    pakistani_company: 'Al Geo Navigators',
    cooperation_mode_raw: 'Import Reduction/Investment',
    investment_value_usd: '10',
    description: 'Precision machinery and equipment',
  },
  {
    sr: '7',
    chinese_company: 'Hebei Yuanfang Gene Tech',
    pakistani_company: 'Concave Agri Services, Pvt., Ltd.',
    cooperation_mode_raw: 'Investment/Trade/JV',
    investment_value_usd: '2',
    description: 'Agri technologies and equipment',
  },
  {
    sr: '8',
    chinese_company: 'Alpha AI Technology Ltd.',
    pakistani_company: 'Rachna Agri Business',
    cooperation_mode_raw: 'Import Reduction/Investment',
    investment_value_usd: '20',
    description: 'Precision machinery and equipment',
  },
  {
    sr: '9',
    chinese_company: 'Henan Academy of Sciences',
    pakistani_company: 'Sprouts Biotechnology Labs',
    cooperation_mode_raw: 'Import (Consumption)',
    investment_value_usd: '50',
    description:
      'Plant tissue culture, breeding research and development lab establishment',
  },
  {
    sr: '10',
    chinese_company: 'Beijing Shangchen Technology Co., Ltd.',
    pakistani_company: 'V-GRO Group',
    cooperation_mode_raw: 'Import (consumption)/Investment',
    investment_value_usd: '10',
    description: 'Import of smart farming equipment',
  },
];

function mapCooperationMode(raw) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('jv')) return 'jv';
  if (value.includes('100%') && value.includes('equity')) return 'agreement';
  return 'mou';
}

function buildExternalReference(sr) {
  return `ISLAMABAD-AGRI-TECH-${sr}`;
}

function buildVentureTitle(chineseCompany, pakistaniCompany) {
  const title = `${chineseCompany} × ${pakistaniCompany}`;
  return title.length > 250 ? `${title.slice(0, 247)}...` : title;
}

function getIslamabadAgriTechRows() {
  return ISLAMABAD_AGRI_TECH_ROWS.map((row) => {
    const cooperation_mode = mapCooperationMode(row.cooperation_mode_raw);
    return {
      ...row,
      external_reference: buildExternalReference(row.sr),
      mou_sub_sector: MOU_SUB_SECTOR,
      sector: PORTAL_SECTOR,
      cooperation_mode,
      venture_name: buildVentureTitle(row.chinese_company, row.pakistani_company),
      signed_copy_status: null,
      jurisdiction: null,
    };
  });
}

function buildProposalRecord(row, partyAId, sectorLeadId) {
  const submittedAt = new Date('2026-06-12T10:00:00.000Z');
  const conferenceInfo = buildConferenceInfo(ISLAMABAD_AGRI_2026, {
    description: `Historic ${row.cooperation_mode.toUpperCase()} imported from Islamabad Agri Tech list (Sr ${row.sr}).`,
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
      project_overview: row.description || row.mou_sub_sector,
      project_segment: row.mou_sub_sector,
      sector_alignment: row.sector,
      investment_ask_summary: row.investment_value_usd
        ? `USD ${row.investment_value_usd} million`
        : '',
    }),
    proposal_description: row.description || row.mou_sub_sector,
    party_b_name: row.chinese_company,
    party_b_organization: row.chinese_company,
    party_b_email: null,
    party_b_phone: null,
    party_b_country: 'China',
    mou_scope: row.mou_sub_sector,
    mou_description: row.description || row.mou_sub_sector,
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
  ISLAMABAD_AGRI_TECH_ROWS,
  getIslamabadAgriTechRows,
  buildProposalRecord,
  buildExternalReference,
};

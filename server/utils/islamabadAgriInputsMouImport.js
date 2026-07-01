const { ISLAMABAD_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');

const MOU_SUB_SECTOR = 'Agro Chemicals and Agricultural Inputs';
const PORTAL_SECTOR = 'Agri Technology & Precision Agriculture Solutions';

const ISLAMABAD_AGRI_INPUTS_ROWS = [
  {
    sr: '1',
    pakistani_company: 'Askari Seeds Private Ltd.',
    chinese_company: 'Anhui SunGu Agritech Co., Ltd.',
    investment_value_usd: '10',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '2',
    pakistani_company: 'Askari Seeds Private Ltd.',
    chinese_company: 'Hubei AllWin High-Tech Seed Co., Ltd.',
    investment_value_usd: '3',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '3',
    pakistani_company: 'Baba Fareed Seed',
    chinese_company: 'Anhui SunGu Agritech Co., Ltd.',
    investment_value_usd: '10',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '4',
    pakistani_company: 'Baba Fareed Seed Corporation',
    chinese_company: 'Sichuan Guohao Seed Ind',
    investment_value_usd: '10',
    description: 'Localized hybrid seed production',
    current_status: 'Negotiation on investment amount',
  },
  {
    sr: '5',
    pakistani_company: 'Guard Agriculture',
    chinese_company: 'Anhui SunGu Agritech Co., Ltd.',
    investment_value_usd: '1000',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '6',
    pakistani_company: 'Guard Agriculture',
    chinese_company: 'Sichuan Guohao Seed Ind',
    investment_value_usd: '1000',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '7',
    pakistani_company: 'Jullundur Pvt Limited',
    chinese_company: 'Anhui SunGu Agritech Co., Ltd.',
    investment_value_usd: '5',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '8',
    pakistani_company: 'Jullundur Pvt Limited',
    chinese_company: 'Shandong Dayi Biotechnology Group Co., Ltd',
    investment_value_usd: '10',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '9',
    pakistani_company: 'Jullundur Pvt Limited',
    chinese_company: 'Sichuan Guohao Seed Ind',
    investment_value_usd: '5',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '10',
    pakistani_company: 'Liaqat Seed Corporation',
    chinese_company: 'Sichuan Guohao Seed Ind',
    investment_value_usd: '0.5',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '11',
    pakistani_company: 'Mumtaz Seed Corporation',
    chinese_company: 'Anhui SunGu Agritech Co., Ltd.',
    investment_value_usd: '1',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '12',
    pakistani_company: 'Open Seed International Agro Crop Sciences (SMC) Pvt. Ltd',
    chinese_company: 'Shanghai Yugu Trading',
    investment_value_usd: '2',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '13',
    pakistani_company: 'Rachna Agri Business',
    chinese_company: 'Anhui SunGu Agritech Co., Ltd.',
    investment_value_usd: '10',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '14',
    pakistani_company: 'Rachna Agri Business',
    chinese_company: 'Hubei AllWin High-Tech Seed Co., Ltd.',
    investment_value_usd: '6',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '15',
    pakistani_company: 'Rachna Agri Business',
    chinese_company: 'Shandong Dayi Biotechnology Group Co., Ltd',
    investment_value_usd: '10',
    description: 'Localized production of biopesticides',
    current_status: 'under negotiation',
  },
  {
    sr: '16',
    pakistani_company: 'Rachna Agri Business',
    chinese_company: 'WINALL HI-TECH SEED CO., LTD.',
    investment_value_usd: '10',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '17',
    pakistani_company: 'Sinker Seed Corporation',
    chinese_company: 'Anhui SunGu Agritech Co., Ltd.',
    investment_value_usd: '10',
    description: 'High Quality Hybrid Seed of rice and maize',
    current_status: 'under negotiation',
  },
  {
    sr: '18',
    pakistani_company: 'Sohni Dharti International',
    chinese_company: 'Anhui SunGu Agritech Co., Ltd.',
    investment_value_usd: '30',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '19',
    pakistani_company: 'Suncrop group Pakistan',
    chinese_company: 'WINALL HI-TECH SEED CO., LTD.',
    investment_value_usd: '90',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '20',
    pakistani_company: 'UH Analytical supplies / UAF',
    chinese_company: 'Shandong Dayi Biotechnology Group Co., Ltd',
    investment_value_usd: '6',
    description:
      'Localized production of Biostimulators/ Plant Growth Regulators/Biopesticides/Bionano material',
    current_status: 'under negotiation',
  },
  {
    sr: '21',
    pakistani_company: 'UH Analytical supplies / UAF',
    chinese_company: 'Zhejiang Jitai New Material Co. Ltd.',
    investment_value_usd: '1',
    description: 'Localized production of Biopesticides/Entomopathogens',
    current_status: 'waiting for negotiation',
  },
  {
    sr: '22',
    pakistani_company: 'University Of Sargodha / Pakistan Agro Fertilizer',
    chinese_company: 'Chengdu Yihe Technology Co., Ltd.',
    investment_value_usd: '42.8',
    description:
      'Local Production of Drones for agricultural uses (Seed, Fertilizer, Pesticides)',
    current_status: 'under negotiation',
  },
  {
    sr: '23',
    pakistani_company: 'V-Gro Group',
    chinese_company: 'Nice (Weifang) Biotechnology Co., Ltd.',
    investment_value_usd: '10',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '24',
    pakistani_company: 'V-Gro Group',
    chinese_company: 'Shaanxi Nong Fertilizer Industry',
    investment_value_usd: '7.5',
    description: 'Liquid Fertilizer and Micro Nutrients',
    current_status: 'under negotiation',
  },
  {
    sr: '25',
    pakistani_company: 'V-Gro Group',
    chinese_company: 'Wuxi Qifa Technology Company',
    investment_value_usd: '5',
    description: 'Localized production of Agi. Inputs',
    current_status: 'under negotiation',
  },
  {
    sr: '26',
    pakistani_company: 'V-Gro Group',
    chinese_company: 'Yangling Bio-Health Agriculture Industry Alliance',
    investment_value_usd: '6.5',
    description: 'Localized hybrid seed production',
    current_status: 'under negotiation',
  },
  {
    sr: '27',
    pakistani_company: 'Four Brothers Agri Services',
    chinese_company: 'Shandong Dayi Biotechnology Group',
    investment_value_usd: '0.2',
    description: 'Liquid Fertilizer and Micro Nutrients',
    current_status: 'both parties agreed to proceed',
  },
];

function buildExternalReference(sr) {
  return `ISLAMABAD-AGRI-INPUTS-${sr}`;
}

function buildVentureTitle(chineseCompany, pakistaniCompany) {
  const title = `${chineseCompany} × ${pakistaniCompany}`;
  return title.length > 250 ? `${title.slice(0, 247)}...` : title;
}

function buildFullDescription(row) {
  const parts = [row.description];
  if (row.current_status) parts.push(`Current status: ${row.current_status}`);
  parts.push('Bottlenecks: N/A');
  parts.push('Tentative timeline: indeterminate');
  return parts.join('\n\n');
}

function getIslamabadAgriInputsRows() {
  return ISLAMABAD_AGRI_INPUTS_ROWS.map((row) => ({
    ...row,
    external_reference: buildExternalReference(row.sr),
    mou_sub_sector: MOU_SUB_SECTOR,
    sector: PORTAL_SECTOR,
    cooperation_mode: 'mou',
    venture_name: buildVentureTitle(row.chinese_company, row.pakistani_company),
    signed_copy_status: null,
    jurisdiction: null,
    bottlenecks: 'N/A',
    tentative_timeline: 'indeterminate',
  }));
}

function buildProposalRecord(row, partyAId, sectorLeadId) {
  const submittedAt = new Date('2026-06-12T10:00:00.000Z');
  const conferenceInfo = buildConferenceInfo(ISLAMABAD_AGRI_2026, {
    description: `Historic MOU imported from Islamabad Agri Inputs list (Sr ${row.sr}).`,
  });
  const fullDescription = buildFullDescription(row);

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
      current_status: row.current_status || null,
      bottlenecks: row.bottlenecks,
      tentative_timeline: row.tentative_timeline,
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
  ISLAMABAD_AGRI_INPUTS_ROWS,
  getIslamabadAgriInputsRows,
  buildProposalRecord,
  buildExternalReference,
};

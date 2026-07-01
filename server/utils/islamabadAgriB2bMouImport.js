const { ISLAMABAD_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');
const { mapSubSectorToPortalSector } = require('./agriMouImport');

const ISLAMABAD_AGRI_B2B_ROWS = [
  {
    sr: '1',
    mou_sub_sector: 'Dairy value Chain (Buffalo)',
    chinese_company: 'Guangxi Baifi Dairy Corporation Limited',
    pakistani_company: 'Fauji Foods Limited',
    cooperation_mode_raw: 'Export based Trade',
    investment_value_usd: '50',
    description:
      'Focus on exporting UHT and Condensed Buffalo milk and later on to camel milk powders.',
    current_status:
      'After the visit of Baifei Dairy to Fauji Foods on 20th Jan, they are now discussing on the product prices',
    bottlenecks: 'Prices are high in Pakistan for buffalo milk',
  },
  {
    sr: '2',
    mou_sub_sector: 'Dairy Value Addition (Products)',
    chinese_company: 'Shanghai Mainstream',
    pakistani_company: 'Mawa Dairy',
    cooperation_mode_raw: 'Export based trade',
    investment_value_usd: '150',
    description: 'Export based trade of cow milk products',
    current_status: 'Strengthening the ties for cheese business and export',
    bottlenecks: 'Meeting the product quality standards of cow cheese',
  },
  {
    sr: '3',
    mou_sub_sector: 'Meat Value addition',
    chinese_company: 'Ba Niu Food Pvt. Ltd.',
    pakistani_company: 'Hamza Halal Foods',
    cooperation_mode_raw: 'Investment and Export based Trade',
    investment_value_usd: '150',
    description:
      'Collaboration is for heat treated beef export and JV for upgradation of slaughter house',
    current_status: 'The MOU is in the process of positive and constructive negotiation.',
    bottlenecks: 'In Process',
  },
  {
    sr: '4',
    mou_sub_sector: 'Meat Value addition',
    chinese_company: 'LZ Enterprise Co. Ltd.',
    pakistani_company: 'Abedin International Pvt Ltd',
    cooperation_mode_raw: 'Dropped',
    investment_value_usd: '300',
    description: 'Export of heat treated beef',
    current_status: 'Dropped',
    bottlenecks: 'Communication gap',
    collaboration_dropped: true,
  },
  {
    sr: '5',
    mou_sub_sector: 'Meat Value addition',
    chinese_company: 'Tian Jin Gengqin Keji You Xian Gong Si',
    pakistani_company: 'Genovex Global',
    cooperation_mode_raw: 'Export based Partnership agreements',
    investment_value_usd: '400',
    description:
      'Collaborated for the export of heat treated beef while upgrading the slaughterhouse',
    current_status: 'Chinese side is agreeing for $10m',
    bottlenecks: 'Limited progress, because of weak communication',
  },
  {
    sr: '6',
    mou_sub_sector: 'Meat Value addition',
    chinese_company: 'Yili Xuelian Dairy Co. Ltd.',
    pakistani_company: 'Green Corporate Livestock Initiative (GCLI)',
    cooperation_mode_raw: 'Export based Trade',
    investment_value_usd: '1',
    description:
      'Technology sharing for breed improvement through embryo transfer (especially for beef)',
    current_status:
      'The Chinese Company has received the sample from Pakistan and is currently assessing the local Chinese market for further progress.',
    bottlenecks: 'In Process',
  },
  {
    sr: '7',
    mou_sub_sector: 'Meat Value addition',
    chinese_company: 'Eastern Agro Farms',
    pakistani_company: 'Al Shayza International Traders',
    cooperation_mode_raw: 'Export based Trade',
    investment_value_usd: '20',
    description: 'Collaborated for export of heat treated beef',
    current_status: 'Export base trade has stopped',
    bottlenecks: 'In Process',
  },
  {
    sr: '8',
    mou_sub_sector: 'Meat Value addition',
    chinese_company: 'LZ Enterprise Co. Ltd.',
    pakistani_company: 'Green Corporate Livestock Initiative (GCLI)',
    cooperation_mode_raw: 'Export based Trade',
    investment_value_usd: '20',
    description: 'Export of heat treated beef',
    current_status: 'The MOU is in the process of positive and constructive negotiation.',
    bottlenecks: 'In Process',
  },
  {
    sr: '9',
    mou_sub_sector: 'Meat Produts further Value addition',
    chinese_company: 'Ba Niu Food Pvt. Ltd.',
    pakistani_company: 'Sheikh of Sialkot',
    cooperation_mode_raw: 'Technology based',
    investment_value_usd: '10',
    description: 'Technology partnership in the field of Gelatin and Collagen fiber production',
    current_status: 'Communication',
    bottlenecks: 'In Process',
  },
  {
    sr: '10',
    mou_sub_sector: 'Meat Value addition',
    chinese_company: 'Guoguan Agriculture',
    pakistani_company: 'Genovex Global',
    cooperation_mode_raw: 'Export based Trade',
    investment_value_usd: '100',
    description: 'Export of heat treated beef',
    current_status: 'Pakistani Company wish to proceed further',
    bottlenecks: 'The overall cooperation intention relatively low with no clear willingness',
  },
  {
    sr: '11',
    mou_sub_sector: 'Meat Value addition',
    chinese_company: 'Guoguan Agriculture',
    pakistani_company: 'Genovex Global',
    cooperation_mode_raw: 'Dropped',
    investment_value_usd: '100',
    description: 'Export of heat treated offals/ Chicken Feet',
    current_status: 'May please be Dropped',
    bottlenecks: 'In Active',
    collaboration_dropped: true,
  },
  {
    sr: '12',
    mou_sub_sector: 'Dairy Input (Machinery)',
    chinese_company: 'Shanghai Mainstream',
    pakistani_company: 'Dairy Machinery Pk',
    cooperation_mode_raw: 'Dropped',
    investment_value_usd: '150',
    description: 'Technology partnership for improving local machinery of milk processing',
    current_status: 'Inactive',
    bottlenecks: 'No communication',
    collaboration_dropped: true,
  },
  {
    sr: '13',
    mou_sub_sector: 'Animal Feed',
    chinese_company: 'Honorary Investment Counsellor',
    pakistani_company: 'China PVT Ltd Islamabad',
    cooperation_mode_raw: 'Export based Trade',
    investment_value_usd: '4',
    description: 'Collaboration for efficient Fodder production',
    current_status: 'Already in collaboration with business ventures',
    bottlenecks: 'In progress',
  },
  {
    sr: '14',
    mou_sub_sector: 'Animal Feed',
    chinese_company: 'Chaman Chamber of Commerce and Indu',
    pakistani_company: 'Agrifarm',
    cooperation_mode_raw: 'Dropped',
    investment_value_usd: '40',
    description: 'Partnership in the field of feed mill equipments',
    current_status: 'May please be Dropped',
    bottlenecks: 'No communication',
    collaboration_dropped: true,
  },
];

function mapCooperationMode(raw) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('jv')) return 'jv';
  return 'mou';
}

function buildExternalReference(sr) {
  return `ISLAMABAD-AGRI-B2B-${sr}`;
}

function buildVentureTitle(chineseCompany, pakistaniCompany) {
  const title = `${chineseCompany} × ${pakistaniCompany}`;
  return title.length > 250 ? `${title.slice(0, 247)}...` : title;
}

function buildFullDescription(row) {
  const parts = [row.description];
  if (row.current_status) parts.push(`Current status: ${row.current_status}`);
  if (row.bottlenecks) parts.push(`Bottlenecks: ${row.bottlenecks}`);
  if (row.collaboration_dropped) parts.push('Collaboration status: Dropped');
  return parts.join('\n\n');
}

function getIslamabadAgriB2bRows() {
  return ISLAMABAD_AGRI_B2B_ROWS.map((row) => ({
    ...row,
    external_reference: buildExternalReference(row.sr),
    sector: mapSubSectorToPortalSector(row.mou_sub_sector),
    cooperation_mode: mapCooperationMode(row.cooperation_mode_raw),
    venture_name: buildVentureTitle(row.chinese_company, row.pakistani_company),
    signed_copy_status: null,
    jurisdiction: null,
  }));
}

function buildProposalRecord(row, partyAId, sectorLeadId) {
  const submittedAt = new Date('2026-06-12T10:00:00.000Z');
  const conferenceInfo = buildConferenceInfo(ISLAMABAD_AGRI_2026, {
    description: `Historic ${row.cooperation_mode.toUpperCase()} imported from Islamabad Agri B2B list (Sr ${row.sr}).`,
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
      bottlenecks: row.bottlenecks || null,
      collaboration_type: row.cooperation_mode_raw,
      collaboration_dropped: Boolean(row.collaboration_dropped),
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
  ISLAMABAD_AGRI_B2B_ROWS,
  getIslamabadAgriB2bRows,
  buildProposalRecord,
  buildExternalReference,
};

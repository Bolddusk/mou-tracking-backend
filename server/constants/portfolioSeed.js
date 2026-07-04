const { SECTORS } = require('./sectors');

const PORTFOLIO_SECTOR_LEADS = [
  { sector: 'Agricultural Engineering & Technology', full_name: 'Engr. Badar Munir Khan Niazi, AEI-PARC' },
  { sector: 'Smart Farming Solutions', full_name: 'Engr. Muhammad Asif, CEWRI-PARC' },
  { sector: 'Cold Chain System & Agri Logistics', full_name: 'Dr. Asif Ali Mirani, AEI-PARC' },
  { sector: 'Agri-trade and Export', full_name: 'Dr. Muhammad Ishaq, SSD-PARC' },
  { sector: 'Food Processing and Value Addition', full_name: 'Dr. Amer Mumtaz, FSRI-PARC' },
  {
    sector: 'Fruits & Vegetables Cultivation, Packaging, Processing & Exports',
    full_name: 'Dr. Nausherwan Nobel Nawab, HRI-PARC',
  },
  { sector: 'Seed Production', full_name: 'Dr. Shaukat Ali, NIGAB-PARC' },
  { sector: 'Seed Sales', full_name: 'Dr. Sajjad Khan, CSI-PARC' },
  { sector: 'Pesticide Production', full_name: 'Dr. Anjum Shehzad, IPEP-PARC' },
  { sector: 'Fertilizer Production', full_name: 'Dr. Humair Malik, LRRI-PARC' },
  { sector: 'Livestock Health', full_name: 'Dr. Hamid Irshad, ASI-PARC' },
  { sector: 'Meat & Poultry Industry', full_name: 'Dr. Muhammad Shafiq, AQD-MoNFS&R' },
  { sector: 'Fisheries & Aquaculture (Including Processing)', full_name: 'Mr. Junaid Wattoo, FDB-MoNFS&R' },
  { sector: 'Dairy Inputs & Dairy Processing', full_name: 'Dr. Muhammad Junaid, Livestock Wing-MoNFS&R' },
  { sector: 'Agricultural Biotechnology', full_name: 'Dr. Ramzan Khan, NIGAB-PARC' },
];

const PORTFOLIO_CONFERENCES = [
  {
    key: 'pak-china-sep-25-conference',
    name: 'September 2025 China B2B Conference',
    date: '2025-09-01',
    end_date: '2025-09-30',
    location: 'China',
    host: 'Government of Pakistan',
    report_title: "Snapshot (PM's China Visit, Sept 25, B2B, MNFSR)",
    supports_report: true,
    engagement_type: 'B2B',
    description: 'Pak-China B2B Conference — September 2025, China.',
    submitted_at: '2025-09-15T10:00:00.000Z',
    json_file: '31-Sep-2025-China_B2B_Conference.json',
    ref_prefix: 'SEP25',
  },
  {
    key: 'pak-china-may-2026-b2b-china',
    name: 'May 2026 B2B China Conference',
    date: '2026-05-01',
    end_date: '2026-05-31',
    location: 'China',
    host: 'Government of Pakistan',
    report_title: 'May 2026 B2B China Conference — MOU Snapshot',
    supports_report: true,
    engagement_type: 'B2B',
    description: 'Pak-China B2B Conference — May 2026, China.',
    submitted_at: '2026-05-15T10:00:00.000Z',
    json_file: '44-May-2026-B2B_China_Conference.json',
    ref_prefix: 'MAY26-CN',
  },
  {
    key: 'pak-china-islamabad-agri-2026',
    name: 'January 2026 Islamabad B2B Conference',
    date: '2026-01-01',
    end_date: '2026-01-31',
    location: 'Islamabad, Pakistan',
    host: 'Government of Pakistan',
    report_title: 'Islamabad B2B Conference — MOU Snapshot',
    supports_report: true,
    engagement_type: 'B2B',
    description: 'Pak-China B2B Conference — January 2026, Islamabad.',
    submitted_at: '2026-01-15T10:00:00.000Z',
    json_file: '99-Jan-2026-B2B_Islamabad_Conference.json',
    ref_prefix: 'ISB26',
  },
];

function sectorToSlug(sectorName) {
  return String(sectorName)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildSectorLeadEmail(sectorName, domain = 'test.com') {
  return `${sectorToSlug(sectorName)}-sectorlead@${domain}`;
}

module.exports = {
  SECTORS,
  PORTFOLIO_SECTOR_LEADS,
  PORTFOLIO_CONFERENCES,
  sectorToSlug,
  buildSectorLeadEmail,
};

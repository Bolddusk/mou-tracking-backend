require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { validatePartyAOnlySubmit } = require('../utils/proposalTemplate');

const PARTY_A_EMAIL = 'partya@test.com';
const TABLE = 'mm_pakistan_proposals';

function ventureName() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `PK Matchmaking — GreenTech Agri JV — ${stamp}`;
}

const executive_summary = {
  company_overview:
    'GreenTech Pakistan — agri-inputs and food processing JV seeking Chinese technology partnership.',
  project_overview:
    'Automated rice milling and value-addition facility for export markets under Pak-China corridor.',
  project_segment: 'Agri-chemicals, food processing & value addition',
  sector_alignment:
    'Aligns with Agri-chemicals & Inputs under Pak-China Agri-Investment Conference 2026.',
  investment_ask_summary: 'USD 4.2M equity for plant automation and Chinese technology line',
};

const company_overview = {
  years_in_operation: '12',
  market_standing_pakistan:
    'Established regional processor in Punjab with strong distributor network across agri-inputs.',
  key_certifications: 'ISO 22000, HACCP, Halal certification, EPA compliance.',
  infrastructure_assets: 'Processing unit, cold storage, QC lab, logistics fleet, warehouse.',
  land_project_capacity: '22 acres; 8,000 MT/year milling capacity; expansion land reserved.',
  value_chain_scope: 'Input procurement → processing → packaging → domestic & export distribution.',
  local_provisions: 'Land, labor, regulatory liaison, and local market access for Chinese partner.',
  export_centricity: 'Prepared to meet Chinese buyer QC specs for GCC export within 18 months.',
};

const project_overview = {
  core_activity: 'Automated rice milling, fortified packaging, and agri-input blending for export.',
  site_location: 'Sheikhupura Industrial Zone, Punjab, Pakistan',
  site_readiness_status: 'Land secured; utilities available Q1 2026; environmental clearance in progress',
  chinese_technology_sought:
    'Chinese automated sorting, milling, vacuum packaging, and precision blending line.',
  value_addition_goal: 'Premium export-grade rice derivatives and fortified consumer packs.',
  target_production_capacity: '8,000 MT annual throughput; 2,500 MT agri-input blending',
  phased_roadmap:
    'Phase 1 civil works & permits → Phase 2 equipment install → Phase 3 export certification',
  economic_impact:
    'USD 9M import substitution; 95 direct jobs; FX earnings USD 3M/year target by year 3.',
  sustainability_metrics: '30% water savings via Chinese recycle system; solar-ready roof design.',
};

const financials = {
  years: [
    {
      label: 'FY 2024',
      metrics: {
        total_revenue: '920',
        ebitda: '145',
        net_income: '62',
        total_assets: '1100',
        total_debt: '310',
        shareholder_equity: '480',
        gross_profit_margin: '24',
        ebitda_margin: '16',
        return_on_equity: '13',
        current_ratio: '1.3',
        debt_to_equity: '0.65',
      },
    },
    {
      label: 'FY 2025',
      metrics: {
        total_revenue: '1080',
        ebitda: '178',
        net_income: '78',
        total_assets: '1180',
        total_debt: '290',
        shareholder_equity: '540',
        gross_profit_margin: '25',
        ebitda_margin: '16',
        return_on_equity: '14',
        current_ratio: '1.4',
        debt_to_equity: '0.54',
      },
    },
  ],
  additional_rows: [],
};

const investment_ask = {
  total_project_cost_usd: '5200000',
  investment_ask_equity_usd: '4200000',
  investment_ask_debt_usd: '1000000',
  sponsor_contribution_type: 'Land and existing cold storage infrastructure',
  sponsor_contribution_amount: 'USD 1.1M equivalent',
  fund_utilization_technology_pct: '50',
  fund_utilization_infrastructure_pct: '30',
  fund_utilization_working_capital_pct: '20',
  projected_irr_pct: '19',
  payback_period_years: '7',
  milestone_phase_1: 'Site prep and regulatory clearance (6–12 months).',
  milestone_phase_2: 'Equipment install, commissioning, and trial batches (12–24 months).',
  milestone_phase_3: 'Export certification, scale-up, and GCC market entry (24+ months).',
  sponsor_contribution_pkr_mn: '310',
  raising_from_investors_pkr_mn: '1180',
  total_funds_required_pkr_mn: '1490',
};

const contact_info = {
  name: 'Ali Khan',
  designation: 'CEO, GreenTech Pakistan',
  email: PARTY_A_EMAIL,
  cell: '03001234567',
  wechat: '',
};

async function seedMatchmakingPakistanProposal() {
  const [users] = await pool.query('SELECT id, full_name FROM users WHERE email = ?', [
    PARTY_A_EMAIL,
  ]);
  if (!users.length) {
    throw new Error(`Party A not found (${PARTY_A_EMAIL}). Run npm run db:seed first.`);
  }

  const partyA = users[0];
  const name = ventureName();

  const proposal = {
    party_a_id: partyA.id,
    engagement_type: 'B2B',
    conference_info: JSON.stringify({
      conference_name: 'Pak-China Agri-Investment Conference 2026',
      conference_date: '2026-09-15',
      conference_end_date: '2026-09-17',
      conference_location: 'Islamabad, Pakistan',
      conference_host: 'Ministry of National Food Security & Research',
      conference_description: 'Bilateral agri-investment matchmaking forum for sector leads.',
    }),
    party_a_info: JSON.stringify({
      entity_type: 'business',
      organization_name: 'GreenTech Pakistan',
      department_ministry: '',
      contact_name: 'Ali Khan',
      designation: 'CEO',
      email: PARTY_A_EMAIL,
      phone: '03001234567',
      country: 'Pakistan',
      city: 'Lahore',
    }),
    sector: 'Agri-chemicals & Inputs',
    company_name: 'GreenTech Pakistan',
    venture_name: name,
    proposal_title: name,
    project_type: 'Greenfield',
    executive_summary: JSON.stringify(executive_summary),
    company_overview: JSON.stringify(company_overview),
    project_overview: JSON.stringify(project_overview),
    financials: JSON.stringify(financials),
    investment_ask: JSON.stringify(investment_ask),
    contact_info: JSON.stringify(contact_info),
    proposal_file_url: null,
    company_logo_url: null,
    cover_image_url: null,
    status: 'submitted',
    submitted_at: new Date(),
  };

  const missing = validatePartyAOnlySubmit(proposal);
  if (missing.length) {
    throw new Error(`Validation failed: ${missing.join(', ')}`);
  }

  const cols = Object.keys(proposal);
  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await pool.query(
    `INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${placeholders})`,
    Object.values(proposal)
  );

  console.log(`\nCreated SUBMITTED Pakistan matchmaking proposal #${result.insertId}`);
  console.log(`Table: ${TABLE} (legacy proposals table NOT used)`);
  console.log(`Venture: ${name}`);
  console.log(`Party A: ${PARTY_A_EMAIL} / password123`);
  console.log(`Sector: Agri-chemicals & Inputs`);
  console.log('\n--- API test ---');
  console.log(`GET  /api/matchmaking/pakistan/my          (login as Party A)`);
  console.log(`GET  /api/matchmaking/pakistan/${result.insertId}       (login as Party A)`);
  console.log('No Party B or MOU on this proposal — matchmaking flow only.');
  process.exit(0);
}

seedMatchmakingPakistanProposal().catch((err) => {
  console.error('Matchmaking Pakistan seed failed:', err.message);
  process.exit(1);
});

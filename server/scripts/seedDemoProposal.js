require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { validateSubmit } = require('../utils/proposalTemplate');

const DEMO_EMAIL = 'partya@test.com';
const DEMO_MARKER = 'Khan AgriChem Demo Proposal';

const executive_summary = {
  company_overview:
    'Khan Industries is a leading Pakistani agri-inputs distributor with nationwide dealer network and strong MNFSR relationships.',
  project_overview:
    'Greenfield formulation and packaging plant for crop protection products serving domestic and export markets.',
  project_segment: 'Agri-chemicals formulation & packaging',
  sector_alignment:
    'Directly supports Agri-chemicals & Inputs sector priorities under Pak-China Agri-Investment Conference — import substitution and technology transfer.',
  investment_ask_summary: 'USD 8.5M equity + USD 2M debt for plant and Chinese line integration',
};

const company_overview = {
  years_in_operation: '18',
  market_standing_pakistan:
    'Top-5 regional player in Punjab and Sindh with 120+ authorized dealers and 8% share in targeted crop protection segment.',
  key_certifications: 'ISO 9001, ISO 14001, GMP-aligned formulation practices, EPA Pakistan product registrations.',
  infrastructure_assets:
    'Owned warehouse cluster (Lahore), QC lab, fleet logistics, ERP-enabled inventory system.',
  land_project_capacity: '45 acres secured at M-3 Industrial City; designed capacity 12,000 MT/year formulations.',
  value_chain_scope: 'Import of technicals → formulation → packaging → nationwide distribution → export readiness.',
  local_provisions:
    'Land allocated, skilled labor pool, established regulatory liaison with MNFSR and provincial agriculture departments.',
  export_centricity:
    'Ready to adopt Chinese QC standards and scale to ASEAN export volumes within 24 months post-commissioning.',
};

const project_overview = {
  core_activity: 'Integrated agri-chemical formulation, bottling, and automated packaging hub.',
  site_location: 'M-3 Industrial City, Punjab — CPEC-linked industrial corridor',
  site_readiness_status: 'Land acquired; environmental clearance in progress; utilities connection Q2 2026',
  chinese_technology_sought:
    'Automated wet formulation line, granulation unit, and smart filling/packaging line from certified Chinese OEM.',
  value_addition_goal:
    'Convert imported technical concentrates into finished crop protection products for local and export markets.',
  target_production_capacity: '12,000 MT annual formulation throughput',
  phased_roadmap:
    'Q3 2026 — civil works & utility hookup\nQ1 2027 — equipment install & trial batches\nQ3 2027 — commercial production',
  economic_impact:
    'Estimated USD 22M annual import substitution; 180 direct jobs; FX earnings potential USD 6M/year from exports.',
  sustainability_metrics:
    'Closed-loop effluent treatment; 25% energy reduction via Chinese process controls; zero liquid discharge target.',
};

const financials = {
  years: [
    {
      label: 'FY 2023',
      metrics: {
        total_revenue: '1850',
        ebitda: '320',
        net_income: '145',
        total_assets: '2100',
        total_debt: '680',
        shareholder_equity: '920',
        gross_profit_margin: '28',
        ebitda_margin: '17',
        return_on_equity: '16',
        current_ratio: '1.4',
        debt_to_equity: '0.74',
      },
    },
    {
      label: 'FY 2024',
      metrics: {
        total_revenue: '2140',
        ebitda: '390',
        net_income: '178',
        total_assets: '2280',
        total_debt: '640',
        shareholder_equity: '1040',
        gross_profit_margin: '29',
        ebitda_margin: '18',
        return_on_equity: '17',
        current_ratio: '1.5',
        debt_to_equity: '0.62',
      },
    },
    {
      label: 'FY 2025',
      metrics: {
        total_revenue: '2480',
        ebitda: '455',
        net_income: '210',
        total_assets: '2510',
        total_debt: '600',
        shareholder_equity: '1180',
        gross_profit_margin: '30',
        ebitda_margin: '18',
        return_on_equity: '18',
        current_ratio: '1.6',
        debt_to_equity: '0.51',
      },
    },
  ],
  additional_rows: [
    {
      category: 'Capex',
      label: 'Plant expansion (project phase)',
      values: { 'FY 2023': '120', 'FY 2024': '280', 'FY 2025': '450' },
    },
  ],
};

const investment_ask = {
  total_project_cost_usd: '10500000',
  investment_ask_equity_usd: '8500000',
  investment_ask_debt_usd: '2000000',
  sponsor_contribution_type: 'Land, existing warehouse infrastructure, and cash',
  sponsor_contribution_amount: 'USD 3.2M equivalent (land + civil works prep)',
  fund_utilization_technology_pct: '45',
  fund_utilization_infrastructure_pct: '35',
  fund_utilization_working_capital_pct: '20',
  projected_irr_pct: '22',
  payback_period_years: '6',
  milestone_phase_1: 'Site preparation, regulatory approvals, and utility connections (6–12 months).',
  milestone_phase_2: 'Equipment import, installation, commissioning, trial production (12–24 months).',
  milestone_phase_3: 'Full commercial ops, export certification, Chinese JV operational integration (24+ months).',
  sponsor_contribution_pkr_mn: '890',
  raising_from_investors_pkr_mn: '2380',
  total_funds_required_pkr_mn: '3270',
};

const contact_info = {
  name: 'Ali Khan',
  designation: 'CEO, Khan Industries Pvt Ltd',
  email: 'partya@test.com',
  cell: '03001234567',
  wechat: 'AliKhan_KI2026',
};

function buildDemoProposal(partyAId) {
  return {
    party_a_id: partyAId,
    status: 'submitted',
    sector: 'Agri-chemicals & Inputs',
    company_name: 'Khan Industries Pvt Ltd',
    venture_name: 'Khan AgriChem Formulation & Packaging Hub',
    proposal_title: 'Khan AgriChem Formulation & Packaging Hub',
    project_type: 'Greenfield',
    executive_summary: JSON.stringify(executive_summary),
    company_overview: JSON.stringify(company_overview),
    project_overview: JSON.stringify(project_overview),
    financials: JSON.stringify(financials),
    investment_ask: JSON.stringify(investment_ask),
    contact_info: JSON.stringify(contact_info),
    proposal_file_url: null,
    party_b_name: 'Zhang Wei',
    party_b_organization: 'SinoAgro Technologies Ltd',
    party_b_email: 'zhangwei.demo@sinoagro.cn',
    party_b_phone: '+86-138-0000-1234',
    party_b_country: 'China',
    mou_scope: 'Technology transfer, joint formulation standards, and export market development',
    mou_description:
      'MOU covers supply of Chinese formulation line, operator training, QC protocol alignment, and co-development of export-grade product portfolio for Middle East and ASEAN.',
    mou_sector: 'Agri-chemicals & Inputs',
    mou_demand:
      'Chinese partner to provide equipment, process license, and offtake support for first 3 export consignments.',
    mou_file_url: 'http://localhost:5000/uploads/demo-mou-khan-agrichem.pdf',
    submitted_at: new Date(),
  };
}

async function seedDemoProposal() {
  const [users] = await pool.query('SELECT id, full_name FROM users WHERE email = ?', [DEMO_EMAIL]);
  if (!users.length) {
    throw new Error(`Party A not found (${DEMO_EMAIL}). Run npm run db:seed first.`);
  }

  const partyA = users[0];

  const [existing] = await pool.query(
    `SELECT id, status FROM proposals
     WHERE party_a_id = ? AND venture_name = ?`,
    [partyA.id, 'Khan AgriChem Formulation & Packaging Hub']
  );

  if (existing.length) {
    console.log(`Demo proposal already exists — ID #${existing[0].id} (${existing[0].status})`);
    console.log(`Login: ${DEMO_EMAIL} / password123`);
    console.log(`Sector lead review: sectorlead@test.com (Agri-chemicals & Inputs)`);
    process.exit(0);
  }

  const proposal = buildDemoProposal(partyA.id);
  const missing = validateSubmit(proposal);
  if (missing.length) {
    throw new Error(`Demo data validation failed: ${missing.join(', ')}`);
  }

  const cols = Object.keys(proposal);
  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await pool.query(
    `INSERT INTO proposals (${cols.join(', ')}) VALUES (${placeholders})`,
    Object.values(proposal)
  );

  console.log(`Created submitted demo proposal #${result.insertId}`);
  console.log(`Title: ${DEMO_MARKER}`);
  console.log(`Party A: ${partyA.full_name} (${DEMO_EMAIL})`);
  console.log(`Sector: Agri-chemicals & Inputs → visible to sectorlead@test.com`);
  console.log('\nView as Party A: /dashboard/party-a');
  console.log('Review as Sector Lead: /dashboard/sector-lead');
  process.exit(0);
}

seedDemoProposal().catch((err) => {
  console.error('Demo proposal seed failed:', err.message);
  process.exit(1);
});

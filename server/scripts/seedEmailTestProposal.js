require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { validateSubmit } = require('../utils/proposalTemplate');

const PARTY_A_EMAIL = 'partya@test.com';
const PARTY_B_EMAIL = 'agentaaugmenteck@yopmail.com';
function ventureName() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `AVRIO Party B Email Test — ${stamp}`;
}

const executive_summary = {
  company_overview: 'GreenTech Pakistan — food processing JV ready for Chinese technology partnership.',
  project_overview: 'Automated rice milling and value-addition facility for export markets.',
  project_segment: 'Food processing & value addition',
  sector_alignment: 'Aligns with Food Processing & Value Addition under Pak-China Agri-Investment Conference.',
  investment_ask_summary: 'USD 4.2M equity for plant and Chinese automation line',
};

const company_overview = {
  years_in_operation: '12',
  market_standing_pakistan: 'Established regional processor in Punjab with strong distributor network.',
  key_certifications: 'ISO 22000, HACCP, Halal certification.',
  infrastructure_assets: 'Processing unit, cold storage, QC lab, logistics fleet.',
  land_project_capacity: '22 acres; 8,000 MT/year milling capacity.',
  value_chain_scope: 'Paddy procurement → milling → packaging → export.',
  local_provisions: 'Land, labor, and regulatory support for Chinese partner onboarding.',
  export_centricity: 'Prepared to meet Chinese buyer QC specs for GCC export within 18 months.',
};

const project_overview = {
  core_activity: 'Automated rice milling and fortified packaging for export.',
  site_location: 'Sheikhupura Industrial Zone, Punjab',
  site_readiness_status: 'Land secured; utilities available Q1 2026',
  chinese_technology_sought: 'Chinese automated sorting, milling, and vacuum packaging line.',
  value_addition_goal: 'Premium export-grade rice derivatives and fortified consumer packs.',
  target_production_capacity: '8,000 MT annual throughput',
  phased_roadmap: 'Phase 1 civil works → Phase 2 equipment → Phase 3 export certification',
  economic_impact: 'USD 9M import substitution; 95 jobs; FX earnings USD 3M/year target.',
  sustainability_metrics: '30% water savings via Chinese recycle system.',
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
  sponsor_contribution_type: 'Land and existing cold storage',
  sponsor_contribution_amount: 'USD 1.1M equivalent',
  fund_utilization_technology_pct: '50',
  fund_utilization_infrastructure_pct: '30',
  fund_utilization_working_capital_pct: '20',
  projected_irr_pct: '19',
  payback_period_years: '7',
  milestone_phase_1: 'Site prep and regulatory clearance (6–12 months).',
  milestone_phase_2: 'Equipment install and trial batches (12–24 months).',
  milestone_phase_3: 'Export certification and scale-up (24+ months).',
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

async function unlinkPartyBFromProposals() {
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [PARTY_B_EMAIL]);
  if (!rows.length) return;

  const userId = rows[0].id;
  await pool.query('UPDATE proposals SET party_b_user_id = NULL WHERE party_b_user_id = ?', [userId]);
  console.log(`Unlinked ${PARTY_B_EMAIL} from old proposals (user kept — approve will email new temp password).`);
}

async function seedEmailTestProposal() {
  const [users] = await pool.query('SELECT id, full_name FROM users WHERE email = ?', [PARTY_A_EMAIL]);
  if (!users.length) {
    throw new Error(`Party A not found (${PARTY_A_EMAIL}). Run npm run db:seed first.`);
  }

  const partyA = users[0];

  await unlinkPartyBFromProposals();

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
      conference_description: 'Bilateral agri-investment matchmaking forum.',
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
    party_b_entity_type: 'business',
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
    party_b_name: 'Li Wei',
    party_b_organization: 'SinoGrain Technologies Co.',
    party_b_email: PARTY_B_EMAIL,
    party_b_phone: '+86-139-0000-5678',
    party_b_country: 'China',
    mou_scope: 'Joint venture technology transfer and export development',
    mou_description:
      'MOU for Chinese milling automation, operator training, and co-branded export packs for GCC markets.',
    mou_sector: 'Agri-chemicals & Inputs',
    mou_demand: 'Chinese partner provides equipment specs, commissioning support, and first-year export liaison.',
    mou_file_url: 'http://localhost:5000/uploads/demo-mou-email-test.pdf',
    status: 'submitted',
    submitted_at: new Date(),
  };

  const missing = validateSubmit(proposal);
  if (missing.length) {
    throw new Error(`Validation failed: ${missing.join(', ')}`);
  }

  const cols = Object.keys(proposal);
  const placeholders = cols.map(() => '?').join(', ');
  const [result] = await pool.query(
    `INSERT INTO proposals (${cols.join(', ')}) VALUES (${placeholders})`,
    Object.values(proposal)
  );

  console.log(`\nCreated SUBMITTED proposal #${result.insertId}`);
  console.log(`Venture: ${name}`);
  console.log(`Open: http://localhost:5173/proposals/${result.insertId}`);
  console.log(`Party A login: ${PARTY_A_EMAIL} / password123`);
  console.log(`Party B email (on approve): ${PARTY_B_EMAIL}`);
  console.log(`Sector: Agri-chemicals & Inputs (sectorlead@test.com can approve)`);
  console.log('\n--- Your test steps ---');
  console.log('1. Login as sectorlead@test.com → Pending tab → Approve');
  console.log(`2. Check inbox: ${PARTY_B_EMAIL} (yopmail) for invite email + password`);
  process.exit(0);
}

seedEmailTestProposal().catch((err) => {
  console.error('Email test proposal seed failed:', err.message);
  process.exit(1);
});

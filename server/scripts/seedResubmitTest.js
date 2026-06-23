require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { validateSubmit } = require('../utils/proposalTemplate');

const PARTY_A_EMAIL = 'partya@test.com';
const SECTOR_LEAD_EMAIL = 'sectorlead@test.com';
const PARTY_B_EMAIL = 'agentaaugmenteck11@yopmail.com';
const SECTOR = 'Agri-chemicals & Inputs';

function ventureName() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `AVRIO Resubmit Test — ${stamp}`;
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

async function seedResubmitTest() {
  const [partyARows] = await pool.query('SELECT id, full_name FROM users WHERE email = ?', [
    PARTY_A_EMAIL,
  ]);
  if (!partyARows.length) {
    throw new Error(`Party A not found (${PARTY_A_EMAIL}). Run npm run db:seed first.`);
  }

  const [slRows] = await pool.query('SELECT id, full_name FROM users WHERE email = ?', [
    SECTOR_LEAD_EMAIL,
  ]);
  if (!slRows.length) {
    throw new Error(`Sector Lead not found (${SECTOR_LEAD_EMAIL}). Run npm run db:seed first.`);
  }

  const partyA = partyARows[0];
  const sectorLead = slRows[0];
  const name = ventureName();
  const rejectionComment =
    'Please update financial projections for FY 2026 and clarify Chinese partner equity structure before resubmitting.';

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
    sector: SECTOR,
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
    mou_sector: SECTOR,
    mou_demand: 'Chinese partner provides equipment specs, commissioning support, and first-year export liaison.',
    mou_file_url: 'http://localhost:5000/uploads/demo-mou-resubmit-test.pdf',
    status: 'rejected',
    sector_lead_comment: rejectionComment,
    reviewed_by: sectorLead.id,
    reviewed_at: new Date(),
    submitted_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    resubmit_count: 0,
    last_resubmitted_at: null,
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

  const proposalId = result.insertId;

  console.log('\n=== Resubmit flow test data ready ===\n');
  console.log(`Proposal ID: #${proposalId}`);
  console.log(`Status: rejected`);
  console.log(`Venture: ${name}`);
  console.log(`Party B email: ${PARTY_B_EMAIL}`);
  console.log(`SL rejection comment: "${rejectionComment}"`);
  console.log(`\nOpen: http://localhost:5173/proposals/${proposalId}`);
  console.log(`\nLogins (password: password123):`);
  console.log(`  Party A:  ${PARTY_A_EMAIL}`);
  console.log(`  SL:       ${SECTOR_LEAD_EMAIL} (${SECTOR})`);
  console.log('\n--- Test steps ---');
  console.log('1. Login as Party A → open proposal → see rejection banner');
  console.log('2. Edit fields → Save Draft (status stays rejected)');
  console.log('3. Click Resubmit → PATCH /api/proposals/:id/resubmit');
  console.log('4. Login as SL → proposal appears in queue as resubmitted');
  console.log('5. Approve → Party B invite goes to yopmail inbox above');

  await pool.end();
  process.exit(0);
}

seedResubmitTest().catch(async (err) => {
  console.error('Resubmit test seed failed:', err.message);
  if (err.message.includes('resubmit_count')) {
    console.error('Run: npm run db:migrate:proposal-resubmit');
  }
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});

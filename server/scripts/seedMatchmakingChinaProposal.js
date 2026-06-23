require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { validateChinaProposalSubmit } = require('../utils/proposalTemplate');

const RFP_EMAIL = 'rfp@test.com';
const TABLE = 'mm_china_proposals';

const executive_summary = {
  company_overview: 'SinoAgri Corp — fertilizer and agri-tech manufacturer seeking Pakistan JV partner.',
  project_overview: 'Precision blending plant and technology export for Pakistan agri-inputs sector.',
  project_segment: 'Agri-chemicals & Inputs',
  sector_alignment: 'Matches Agri-chemicals & Inputs corridor proposals from Pakistan.',
  investment_ask_summary: 'USD 3.8M technology + equipment package for JV setup',
};

const company_overview = {
  years_in_operation: '18',
  key_certifications: 'ISO 9001, ISO 14001, China Green Food certification.',
  infrastructure_assets: '3 manufacturing plants, R&D centre, export logistics hub.',
  value_chain_scope: 'Raw inputs → blending → packaging → export & licensing.',
};

const project_overview = {
  core_activity: 'Agri-input blending technology and automated packaging line export.',
  site_location: 'Jiangsu Province, China (technology origin)',
  target_production_capacity: '6,500 MT annual blending capacity for JV deployment',
};

const financials = {
  years: [
    {
      label: 'FY 2024',
      metrics: {
        total_revenue: '1200',
        ebitda: '210',
        net_income: '95',
        total_assets: '1500',
        total_debt: '280',
        shareholder_equity: '720',
        gross_profit_margin: '28',
        ebitda_margin: '18',
        return_on_equity: '13',
        current_ratio: '1.5',
        debt_to_equity: '0.39',
      },
    },
  ],
  additional_rows: [],
};

const investment_ask = {
  total_project_cost_usd: '4800000',
  investment_ask_equity_usd: '3800000',
  fund_utilization_technology_pct: '55',
  fund_utilization_infrastructure_pct: '25',
  fund_utilization_working_capital_pct: '20',
};

const contact_info = {
  name: 'Li Wei',
  designation: 'Director, International Cooperation',
  email: 'liwei@china-agri.cn',
  cell: '+86-138-0000-5678',
};

async function seed() {
  const [users] = await pool.query('SELECT id FROM users WHERE email = ?', [RFP_EMAIL]);
  if (!users.length) {
    throw new Error(`RFP not found (${RFP_EMAIL}). Run npm run db:seed first.`);
  }

  const rfpId = users[0].id;
  const ventureName = `CN Matchmaking — SinoAgri Tech JV — ${new Date().toISOString().slice(0, 16)}`;

  const proposal = {
    uploaded_by_rfp: rfpId,
    engagement_type: 'B2B',
    sector: 'Agri-chemicals & Inputs',
    company_name: 'SinoAgri Corp',
    venture_name: ventureName,
    proposal_title: ventureName,
    project_type: 'Brownfield',
    party_b_entity_type: 'business',
    party_b_name: 'Li Wei',
    party_b_organization: 'SinoAgri Corp',
    party_b_email: 'agentaaugmenteck@yopmail.com',
    party_b_phone: '+86-138-0000-5678',
    party_b_country: 'China',
    executive_summary: JSON.stringify(executive_summary),
    company_overview: JSON.stringify(company_overview),
    project_overview: JSON.stringify(project_overview),
    financials: JSON.stringify(financials),
    investment_ask: JSON.stringify(investment_ask),
    contact_info: JSON.stringify(contact_info),
    status: 'active',
  };

  const missing = validateChinaProposalSubmit(proposal);
  if (missing.length) {
    throw new Error(`Validation failed: ${missing.join(', ')}`);
  }

  const cols = Object.keys(proposal);
  const [result] = await pool.query(
    `INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(proposal)
  );

  console.log(`\nCreated China matchmaking proposal #${result.insertId}`);
  console.log(`RFP: ${RFP_EMAIL} / password123`);
  console.log(`Sector: Agri-chemicals & Inputs (matches PK proposals)`);
  console.log(`GET /api/matchmaking/rfp/china`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('China seed failed:', err.message);
  process.exit(1);
});

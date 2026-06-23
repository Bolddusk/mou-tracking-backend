require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { validatePartyAOnlySubmit, validateChinaProposalSubmit } = require('../utils/proposalTemplate');

const PARTY_A_EMAIL = 'partya@test.com';
const INVESTOR_EMAIL = 'investor@test.com';
const SECTOR_LEAD_EMAIL = 'sectorlead@test.com';
const SECTOR = 'Agri-chemicals & Inputs';

const pkExecutive = {
  company_overview: 'GreenTech Pakistan — agri-inputs JV seeking Chinese technology partnership.',
  project_overview: 'Automated rice milling and value-addition for export markets.',
  project_segment: SECTOR,
  sector_alignment: 'Aligns with Pak-China Agri-Investment Conference 2026.',
  investment_ask_summary: 'USD 4.2M equity for plant automation and Chinese technology line',
};

const pkCompany = {
  years_in_operation: '12',
  market_standing_pakistan: 'Established regional processor in Punjab.',
  key_certifications: 'ISO 22000, HACCP, Halal certification.',
  infrastructure_assets: 'Processing unit, cold storage, QC lab.',
  land_project_capacity: '22 acres; 8,000 MT/year capacity.',
  value_chain_scope: 'Input procurement → processing → packaging → export.',
  local_provisions: 'Land, labor, regulatory liaison for Chinese partner.',
  export_centricity: 'GCC export ready within 18 months.',
};

const pkProject = {
  core_activity: 'Automated rice milling and agri-input blending for export.',
  site_location: 'Sheikhupura Industrial Zone, Punjab',
  site_readiness_status: 'Land secured; utilities Q1 2026',
  chinese_technology_sought: 'Chinese automated sorting, milling, packaging line.',
  value_addition_goal: 'Premium export-grade rice derivatives.',
  target_production_capacity: '8,000 MT annual throughput',
  phased_roadmap: 'Phase 1 permits → Phase 2 equipment → Phase 3 export cert',
  economic_impact: '95 jobs; USD 3M/year FX target.',
  sustainability_metrics: '30% water savings via Chinese recycle system.',
};

const pkFinancials = {
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
  ],
  additional_rows: [],
};

const pkInvestment = {
  total_project_cost_usd: '5200000',
  investment_ask_equity_usd: '4200000',
  investment_ask_debt_usd: '1000000',
  sponsor_contribution_type: 'Land and cold storage',
  sponsor_contribution_amount: 'USD 1.1M equivalent',
  fund_utilization_technology_pct: '50',
  fund_utilization_infrastructure_pct: '30',
  fund_utilization_working_capital_pct: '20',
  projected_irr_pct: '19',
  payback_period_years: '7',
  milestone_phase_1: 'Site prep and regulatory clearance.',
  milestone_phase_2: 'Equipment install and trial batches.',
  milestone_phase_3: 'Export certification and scale-up.',
  sponsor_contribution_pkr_mn: '310',
  raising_from_investors_pkr_mn: '1180',
  total_funds_required_pkr_mn: '1490',
};

const cnExecutive = {
  company_overview: 'SinoAgri Corp — agri-tech manufacturer seeking Pakistan JV partner.',
  project_overview: 'Precision blending plant and technology export for Pakistan agri-inputs.',
  project_segment: SECTOR,
  sector_alignment: 'Same sector as Pakistan GreenTech proposal.',
  investment_ask_summary: 'USD 3.8M technology + equipment package for JV setup',
};

const cnCompany = {
  years_in_operation: '18',
  key_certifications: 'ISO 9001, ISO 14001',
  infrastructure_assets: '3 manufacturing plants, R&D centre',
  value_chain_scope: 'Raw inputs → blending → packaging → export',
};

const cnProject = {
  core_activity: 'Agri-input blending technology export for Pakistan JV.',
  site_location: 'Jiangsu Province, China',
  target_production_capacity: '6,500 MT annual capacity',
};

const cnFinancials = {
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

const cnInvestment = {
  total_project_cost_usd: '4800000',
  investment_ask_equity_usd: '3800000',
  fund_utilization_technology_pct: '55',
  fund_utilization_infrastructure_pct: '25',
  fund_utilization_working_capital_pct: '20',
};

async function requireUser(email, label) {
  const [rows] = await pool.query('SELECT id, email, role, sector FROM users WHERE email = ?', [
    email,
  ]);
  if (!rows.length) {
    throw new Error(`${label} not found (${email}). Run: npm run db:seed`);
  }
  return rows[0];
}

async function ensureSectorLeadSector(userId) {
  await pool.query('UPDATE users SET sector = ? WHERE id = ?', [SECTOR, userId]);
}

async function resetMatchmakingData() {
  const [engagementRows] = await pool.query(
    `SELECT engagement_proposal_id FROM mm_matches WHERE engagement_proposal_id IS NOT NULL`
  );
  const engagementIds = engagementRows.map((r) => r.engagement_proposal_id).filter(Boolean);

  await pool.query('DELETE FROM mm_matches');
  await pool.query('DELETE FROM mm_china_proposals');
  await pool.query('DELETE FROM mm_pakistan_proposals');

  if (engagementIds.length > 0) {
    const [actRows] = await pool.query(
      'SELECT id FROM proposal_activities WHERE proposal_id IN (?)',
      [engagementIds]
    );
    const activityIds = actRows.map((r) => r.id);
    if (activityIds.length > 0) {
      await pool.query('DELETE FROM activity_comments WHERE activity_id IN (?)', [activityIds]);
      await pool.query('DELETE FROM activity_approvals WHERE activity_id IN (?)', [activityIds]);
    }
    await pool.query('DELETE FROM proposal_chat_messages WHERE proposal_id IN (?)', [engagementIds]);
    await pool.query('DELETE FROM proposal_activities WHERE proposal_id IN (?)', [engagementIds]);
    await pool.query('DELETE FROM proposals WHERE id IN (?)', [engagementIds]);
    console.log(`Cleaned ${engagementIds.length} old engagement(s)`);
  }
}

async function seed() {
  const partyA = await requireUser(PARTY_A_EMAIL, 'Party A');
  const investor = await requireUser(INVESTOR_EMAIL, 'Chinese Investor');
  const sectorLead = await requireUser(SECTOR_LEAD_EMAIL, 'Sector Lead');

  if (investor.role !== 'chinese_investor') {
    throw new Error(
      `${INVESTOR_EMAIL} is not chinese_investor. Run: npm run db:migrate:chinese-investor-role && npm run db:seed`
    );
  }

  await ensureSectorLeadSector(sectorLead.id);
  await resetMatchmakingData();

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '').slice(0, 15);
  const tag = `FLOW-${stamp}`;
  const pkVenture = `PK-GreenTech-RiceMill-${tag}`;
  const cnVenture = `CN-SinoAgri-BlendingTech-${tag}`;

  const pkProposal = {
    party_a_id: partyA.id,
    engagement_type: 'B2B',
    conference_info: JSON.stringify({
      conference_name: 'Pak-China Agri-Investment Conference 2026',
      conference_date: '2026-09-15',
      conference_end_date: '2026-09-17',
      conference_location: 'Islamabad, Pakistan',
      conference_host: 'Ministry of National Food Security & Research',
      conference_description: 'V2 matchmaking test seed.',
    }),
    party_a_info: JSON.stringify({
      entity_type: 'business',
      organization_name: 'GreenTech Pakistan',
      contact_name: 'Ali Khan',
      designation: 'CEO',
      email: PARTY_A_EMAIL,
      phone: '03001234567',
      country: 'Pakistan',
      city: 'Lahore',
    }),
    sector: SECTOR,
    company_name: 'GreenTech Pakistan',
    venture_name: pkVenture,
    proposal_title: pkVenture,
    project_type: 'Greenfield',
    executive_summary: JSON.stringify(pkExecutive),
    company_overview: JSON.stringify(pkCompany),
    project_overview: JSON.stringify(pkProject),
    financials: JSON.stringify(pkFinancials),
    investment_ask: JSON.stringify(pkInvestment),
    contact_info: JSON.stringify({
      name: 'Ali Khan',
      designation: 'CEO, GreenTech Pakistan',
      email: PARTY_A_EMAIL,
      cell: '03001234567',
      wechat: '',
    }),
    status: 'submitted',
    submitted_at: new Date(),
  };

  const pkMissing = validatePartyAOnlySubmit(pkProposal);
  if (pkMissing.length) throw new Error(`PK validation: ${pkMissing.join(', ')}`);

  const pkCols = Object.keys(pkProposal);
  const [pkResult] = await pool.query(
    `INSERT INTO mm_pakistan_proposals (${pkCols.join(', ')}) VALUES (${pkCols.map(() => '?').join(', ')})`,
    Object.values(pkProposal)
  );
  const pkId = pkResult.insertId;

  const cnProposal = {
    submitted_by_investor: investor.id,
    engagement_type: 'B2B',
    sector: SECTOR,
    company_name: 'SinoAgri Corp',
    venture_name: cnVenture,
    proposal_title: cnVenture,
    project_type: 'Brownfield',
    party_b_entity_type: 'business',
    party_b_name: 'Li Wei',
    party_b_organization: 'SinoAgri Corp',
    party_b_email: 'agentaaugmenteck@yopmail.com',
    party_b_phone: '+86-138-0000-5678',
    party_b_country: 'China',
    executive_summary: JSON.stringify(cnExecutive),
    company_overview: JSON.stringify(cnCompany),
    project_overview: JSON.stringify(cnProject),
    financials: JSON.stringify(cnFinancials),
    investment_ask: JSON.stringify(cnInvestment),
    contact_info: JSON.stringify({
      name: 'Li Wei',
      designation: 'Director, SinoAgri Corp',
      email: INVESTOR_EMAIL,
      cell: '+86-138-0000-5678',
      wechat: 'liwei_sinoagri',
    }),
    status: 'submitted',
    submitted_at: new Date(),
  };

  const cnMissing = validateChinaProposalSubmit(cnProposal);
  if (cnMissing.length) throw new Error(`China validation: ${cnMissing.join(', ')}`);

  const cnCols = Object.keys(cnProposal);
  const [cnResult] = await pool.query(
    `INSERT INTO mm_china_proposals (${cnCols.join(', ')}) VALUES (${cnCols.map(() => '?').join(', ')})`,
    Object.values(cnProposal)
  );
  const cnId = cnResult.insertId;

  console.log('\n========================================');
  console.log('  MATCHMAKING V2 — BOTH PROPOSALS SEEDED');
  console.log('========================================\n');
  console.log(`Sector: ${SECTOR}\n`);
  console.log(`PK Proposal ID:     ${pkId}  (status: submitted)`);
  console.log(`China Proposal ID: ${cnId}  (status: submitted)\n`);
  console.log('--- Next test steps ---');
  console.log('3. rfp@test.com        → shortlist + forward China');
  console.log('6. sectorlead@test.com → shortlist PK + create match\n');
  console.log('--- Logins (password123) ---');
  console.log(`Party A:          ${PARTY_A_EMAIL}`);
  console.log(`Chinese Investor: ${INVESTOR_EMAIL}`);
  console.log(`China FOP:        rfp@test.com`);
  console.log(`PK Sector Lead:   ${SECTOR_LEAD_EMAIL}`);
  console.log('========================================\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('V2 seed failed:', err.message);
  console.error('\nRun first:');
  console.error('  npm run db:migrate:chinese-investor-role');
  console.error('  npm run db:migrate:matchmaking-china-v2');
  console.error('  npm run db:seed');
  process.exit(1);
});

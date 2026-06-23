require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const pool = require('../config/db');
const { validatePartyAOnlySubmit } = require('../utils/proposalTemplate');

const PARTY_A_EMAIL = 'partya@test.com';
const SECTOR_LEAD_EMAIL = 'sectorlead@test.com';
const RFP_EMAIL = 'rfp@test.com';
const SECTOR = 'Agri-chemicals & Inputs';

const executive_summary = {
  company_overview: 'GreenTech Pakistan — agri-inputs JV seeking Chinese technology partnership.',
  project_overview: 'Automated rice milling and value-addition for export markets.',
  project_segment: 'Agri-chemicals & Inputs',
  sector_alignment: 'Aligns with Pak-China Agri-Investment Conference 2026.',
  investment_ask_summary: 'USD 4.2M equity for plant automation and Chinese technology line',
};

const company_overview = {
  years_in_operation: '12',
  market_standing_pakistan: 'Established regional processor in Punjab.',
  key_certifications: 'ISO 22000, HACCP, Halal certification.',
  infrastructure_assets: 'Processing unit, cold storage, QC lab.',
  land_project_capacity: '22 acres; 8,000 MT/year capacity.',
  value_chain_scope: 'Input procurement → processing → packaging → export.',
  local_provisions: 'Land, labor, regulatory liaison for Chinese partner.',
  export_centricity: 'GCC export ready within 18 months.',
};

const project_overview = {
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

const contact_info = {
  name: 'Ali Khan',
  designation: 'CEO, GreenTech Pakistan',
  email: PARTY_A_EMAIL,
  cell: '03001234567',
  wechat: '',
};

async function requireUser(email, label) {
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE email = ?', [email]);
  if (!rows.length) {
    throw new Error(`${label} not found (${email}). Run: npm run db:seed`);
  }
  return rows[0];
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
    await pool.query('DELETE FROM proposal_chat_messages WHERE proposal_id IN (?)', [engagementIds]);
    await pool.query('DELETE FROM proposal_activities WHERE proposal_id IN (?)', [engagementIds]);
    await pool.query('DELETE FROM proposals WHERE id IN (?)', [engagementIds]);
    console.log(`Cleaned ${engagementIds.length} old engagement proposal(s)`);
  }
  console.log('Cleared mm_matches, mm_china_proposals, mm_pakistan_proposals');
}

async function seed() {
  const partyA = await requireUser(PARTY_A_EMAIL, 'Party A');
  const sectorLead = await requireUser(SECTOR_LEAD_EMAIL, 'Sector Lead');
  const rfp = await requireUser(RFP_EMAIL, 'China RFP');

  await resetMatchmakingData();

  const ventureName = `E2E Test PK Proposal — ${new Date().toISOString().slice(0, 16)}`;

  const proposal = {
    party_a_id: partyA.id,
    engagement_type: 'B2B',
    conference_info: JSON.stringify({
      conference_name: 'Pak-China Agri-Investment Conference 2026',
      conference_date: '2026-09-15',
      conference_end_date: '2026-09-17',
      conference_location: 'Islamabad, Pakistan',
      conference_host: 'Ministry of National Food Security & Research',
      conference_description: 'E2E matchmaking flow test.',
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
    sector: SECTOR,
    company_name: 'GreenTech Pakistan',
    venture_name: ventureName,
    proposal_title: ventureName,
    project_type: 'Greenfield',
    executive_summary: JSON.stringify(executive_summary),
    company_overview: JSON.stringify(company_overview),
    project_overview: JSON.stringify(project_overview),
    financials: JSON.stringify(financials),
    investment_ask: JSON.stringify(investment_ask),
    contact_info: JSON.stringify(contact_info),
    status: 'submitted',
    submitted_at: new Date(),
  };

  const missing = validatePartyAOnlySubmit(proposal);
  if (missing.length) {
    throw new Error(`PK validation failed: ${missing.join(', ')}`);
  }

  const cols = Object.keys(proposal);
  const [result] = await pool.query(
    `INSERT INTO mm_pakistan_proposals (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(proposal)
  );

  const pkId = result.insertId;

  console.log('\n========================================');
  console.log('  MATCHMAKING E2E TEST — SEED READY');
  console.log('========================================\n');
  console.log(`PK Proposal ID: ${pkId}`);
  console.log(`Status: submitted (Step 1 done — start from Step 2)\n`);

  console.log('--- Logins ---');
  console.log(`Party A:       ${PARTY_A_EMAIL} / password123`);
  console.log(`Sector Lead:   ${SECTOR_LEAD_EMAIL} / password123`);
  console.log(`China RFP:     ${RFP_EMAIL} / password123 (id: ${rfp.id})`);
  console.log(`Sector:        ${SECTOR}\n`);

  console.log('--- Full flow (test in order) ---\n');

  console.log('STEP 1 ✅ Party A submitted (seeded)');
  console.log(`  GET /api/matchmaking/pakistan/my  (partya token)\n`);

  console.log('STEP 2 — Sector Lead shortlist');
  console.log(`  GET  /api/matchmaking/pakistan/sector-lead?status=submitted`);
  console.log(`  PATCH /api/matchmaking/pakistan/${pkId}/shortlist`);
  console.log('  Body: { "comment": "Good fit" }\n');

  console.log('STEP 3 — Forward to China RFP');
  console.log(`  GET  /api/users/regional-focal-points  → pick rfp id ${rfp.id}`);
  console.log(`  PATCH /api/matchmaking/pakistan/${pkId}/forward-china`);
  console.log(`  Body: { "regional_focal_point_id": ${rfp.id} }\n`);

  console.log('STEP 4 — RFP view PK proposals');
  console.log('  GET /api/matchmaking/rfp/pakistan  (rfp token)\n');

  console.log('STEP 5 — RFP upload China proposal');
  console.log('  POST /api/matchmaking/rfp/china  (see STEP12D doc for body)');
  console.log('  party_b_email: agentaaugmenteck@yopmail.com (test inbox)\n');

  console.log('STEP 6 — RFP create match (same sector)');
  console.log(`  POST /api/matchmaking/rfp/matches`);
  console.log(`  Body: { "pk_proposal_id": ${pkId}, "china_proposal_id": <cn_id> }\n`);

  console.log('STEP 7 — RFP send to Sector Lead');
  console.log('  PATCH /api/matchmaking/rfp/matches/<match_id>/submit-review\n');

  console.log('STEP 8 — Sector Lead approve match');
  console.log('  GET  /api/matchmaking/matches/pending-review');
  console.log('  PATCH /api/matchmaking/matches/<match_id>/approve');
  console.log('  → save engagement_proposal_id from response\n');

  console.log('STEP 9 — Chat (shared API)');
  console.log('  GET /api/proposals/<engagement_id>/messages');
  console.log('  Socket Step 10 — join with engagement_proposal_id\n');

  console.log('STEP 10 — Activities (shared API)');
  console.log('  GET/POST /api/proposals/<engagement_id>/activities\n');

  console.log('STEP 11 — MOU');
  console.log('  GET   /api/matchmaking/matches/<match_id>/mou');
  console.log('  PATCH /api/matchmaking/matches/<match_id>/mou  (multipart mou_file)\n');

  console.log('Docs: MATCHMAKING_FLOW_TEST.md + STEP12A–12H .md files');
  console.log('========================================\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Matchmaking flow seed failed:', err.message);
  process.exit(1);
});

/**
 * Clears all transactional data (keeps users) and seeds exactly 2 demo records:
 *
 * 1. Direct Opportunity — Party A fills everything (Party A + Party B + MOU in one form)
 * 2. Matchmaking V2 — Party A (PK) and Chinese Investor (China / Party B side) submitted separately
 *
 * Run: npm run db:seed:demo-reset
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const {
  validateSubmit,
  validatePartyAOnlySubmit,
  validateChinaProposalSubmit,
} = require('../utils/proposalTemplate');

const SECTOR = 'Agri-chemicals & Inputs';

const LEGACY_PARTY_A = 'partya@test.com';
const MM_PARTY_A = 'partya@test.com'; // same login — matchmaking shows on /matchmaking/party-a
const INVESTOR_EMAIL = 'investor@test.com';
const SECTOR_LEAD_EMAIL = 'sectorlead@test.com';

const DEMO_PDF_FILENAME = 'testingpdflodhi.pdf';
const DEMO_PDF_SOURCE = path.join(__dirname, '..', '..', DEMO_PDF_FILENAME);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

/** Copy project-root testingpdflodhi.pdf into server/uploads for seeded file URLs */
function ensureDemoUploadPdf() {
  if (!fs.existsSync(DEMO_PDF_SOURCE)) {
    throw new Error(
      `Demo PDF not found: ${DEMO_PDF_SOURCE}\nPlace ${DEMO_PDF_FILENAME} in the project root.`
    );
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  fs.copyFileSync(DEMO_PDF_SOURCE, path.join(UPLOADS_DIR, DEMO_PDF_FILENAME));
  const host = (process.env.API_HOST || 'http://localhost:5000').replace(/\/$/, '');
  return `${host}/uploads/${DEMO_PDF_FILENAME}`;
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function requireUser(email, label) {
  const [rows] = await pool.query('SELECT id, email, role, sector FROM users WHERE email = ?', [
    email,
  ]);
  if (!rows.length) {
    throw new Error(`${label} not found (${email}). Run: npm run db:seed`);
  }
  return rows[0];
}

async function clearTransactionalData() {
  const tables = [
    'activity_comments',
    'activity_approvals',
    'complaint_party_b_engagements',
    'complaint_comments',
    'complaint_actions',
    'proposal_chat_messages',
    'proposal_activities',
    'complaints',
    'mm_matches',
    'proposals',
    'mm_china_proposals',
    'mm_pakistan_proposals',
  ];

  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of tables) {
    if (await tableExists(table)) {
      await pool.query(`DELETE FROM ${table}`);
      console.log(`Cleared: ${table}`);
    }
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
}

function buildLegacyAllInOneProposal(partyAId, demoFileUrl) {
  return {
    party_a_id: partyAId,
    engagement_type: 'B2B',
    conference_info: JSON.stringify({
      conference_name: 'Pak-China Agri-Investment Conference 2026',
      conference_date: '2026-09-15',
      conference_end_date: '2026-09-17',
      conference_location: 'Islamabad, Pakistan',
      conference_host: 'Ministry of National Food Security & Research',
      conference_description: 'Demo 1 — Party A submits full opportunity including Party B and MOU.',
    }),
    party_a_info: JSON.stringify({
      entity_type: 'business',
      organization_name: 'Khan Industries Pvt Ltd',
      contact_name: 'Ali Khan',
      designation: 'CEO',
      email: LEGACY_PARTY_A,
      phone: '03001234567',
      country: 'Pakistan',
      city: 'Lahore',
    }),
    party_b_entity_type: 'business',
    sector: SECTOR,
    company_name: 'Khan Industries Pvt Ltd',
    venture_name: 'DEMO-1 Khan AgriChem Hub (Party A fills all)',
    proposal_title: 'DEMO-1 Khan AgriChem Hub (Party A fills all)',
    project_type: 'Greenfield',
    executive_summary: JSON.stringify({
      company_overview:
        'Khan Industries — nationwide agri-inputs distributor with strong MNFSR relationships.',
      project_overview: 'Formulation and packaging plant for crop protection products.',
      project_segment: 'Agri-chemicals formulation & packaging',
      sector_alignment: 'Pak-China Agri-Investment Conference 2026 priority sector.',
      investment_ask_summary: 'USD 8.5M equity + USD 2M debt for plant and Chinese line integration',
    }),
    company_overview: JSON.stringify({
      years_in_operation: '18',
      market_standing_pakistan: 'Top-5 regional player in Punjab and Sindh.',
      key_certifications: 'ISO 9001, ISO 14001, EPA Pakistan registrations.',
      infrastructure_assets: 'Warehouse cluster, QC lab, ERP inventory system.',
      land_project_capacity: '45 acres at M-3 Industrial City; 12,000 MT/year capacity.',
      value_chain_scope: 'Import → formulation → packaging → distribution → export.',
      local_provisions: 'Land, labor pool, regulatory liaison with MNFSR.',
      export_centricity: 'ASEAN export readiness within 24 months post-commissioning.',
    }),
    project_overview: JSON.stringify({
      core_activity: 'Agri-chemical formulation, bottling, and automated packaging hub.',
      site_location: 'M-3 Industrial City, Punjab',
      site_readiness_status: 'Land acquired; utilities Q2 2026',
      chinese_technology_sought: 'Automated wet formulation and smart packaging line from Chinese OEM.',
      value_addition_goal: 'Finished crop protection products for local and export markets.',
      target_production_capacity: '12,000 MT annual throughput',
      phased_roadmap: 'Civil works → equipment install → commercial production',
      economic_impact: '180 direct jobs; USD 22M import substitution.',
      sustainability_metrics: '25% energy reduction via Chinese process controls.',
    }),
    financials: JSON.stringify({
      years: [
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
      ],
      additional_rows: [],
    }),
    investment_ask: JSON.stringify({
      total_project_cost_usd: '10500000',
      investment_ask_equity_usd: '8500000',
      investment_ask_debt_usd: '2000000',
      sponsor_contribution_type: 'Land and infrastructure',
      sponsor_contribution_amount: 'USD 3.2M equivalent',
      fund_utilization_technology_pct: '45',
      fund_utilization_infrastructure_pct: '35',
      fund_utilization_working_capital_pct: '20',
      projected_irr_pct: '22',
      payback_period_years: '6',
      milestone_phase_1: 'Site preparation and regulatory approvals.',
      milestone_phase_2: 'Equipment install and trial batches.',
      milestone_phase_3: 'Commercial ops and export certification.',
      sponsor_contribution_pkr_mn: '890',
      raising_from_investors_pkr_mn: '2380',
      total_funds_required_pkr_mn: '3270',
    }),
    contact_info: JSON.stringify({
      name: 'Ali Khan',
      designation: 'CEO, Khan Industries Pvt Ltd',
      email: LEGACY_PARTY_A,
      cell: '03001234567',
      wechat: 'AliKhan_KI2026',
    }),
    proposal_file_url: demoFileUrl,
    party_b_name: 'Zhang Wei',
    party_b_organization: 'SinoAgro Technologies Ltd',
    party_b_email: 'zhangwei.demo@sinoagro.cn',
    party_b_phone: '+86-138-0000-1234',
    party_b_country: 'China',
    mou_scope: 'Technology transfer, joint formulation standards, export market development',
    mou_description:
      'MOU covers Chinese formulation line, operator training, QC alignment, and co-development of export portfolio.',
    mou_sector: SECTOR,
    mou_demand:
      'Chinese partner to provide equipment, process license, and offtake support for first 3 export consignments.',
    mou_file_url: demoFileUrl,
    mou_status: 'uploaded',
    status: 'submitted',
    submitted_at: new Date(),
  };
}

function buildPkMatchmakingProposal(partyAId, demoFileUrl) {
  return {
    party_a_id: partyAId,
    engagement_type: 'B2B',
    conference_info: JSON.stringify({
      conference_name: 'Pak-China Agri-Investment Conference 2026',
      conference_date: '2026-09-15',
      conference_end_date: '2026-09-17',
      conference_location: 'Islamabad, Pakistan',
      conference_host: 'Ministry of National Food Security & Research',
      conference_description: 'Demo 2 — Pakistan side only (Party A). China side submitted separately.',
    }),
    party_a_info: JSON.stringify({
      entity_type: 'business',
      organization_name: 'GreenTech Pakistan',
      contact_name: 'Ali Khan',
      designation: 'CEO',
      email: MM_PARTY_A,
      phone: '03001234567',
      country: 'Pakistan',
      city: 'Lahore',
    }),
    sector: SECTOR,
    company_name: 'GreenTech Pakistan',
    venture_name: 'DEMO-2 GreenTech Rice Mill (PK side)',
    proposal_title: 'DEMO-2 GreenTech Rice Mill (PK side)',
    project_type: 'Greenfield',
    executive_summary: JSON.stringify({
      company_overview: 'GreenTech Pakistan — agri-processing JV seeking Chinese technology.',
      project_overview: 'Automated rice milling and value-addition for export.',
      project_segment: SECTOR,
      sector_alignment: 'Pak-China Agri-Investment Conference 2026.',
      investment_ask_summary: 'USD 4.2M equity for plant automation and Chinese technology line',
    }),
    company_overview: JSON.stringify({
      years_in_operation: '12',
      market_standing_pakistan: 'Established regional processor in Punjab.',
      key_certifications: 'ISO 22000, HACCP, Halal certification.',
      infrastructure_assets: 'Processing unit, cold storage, QC lab.',
      land_project_capacity: '22 acres; 8,000 MT/year capacity.',
      value_chain_scope: 'Procurement → processing → packaging → export.',
      local_provisions: 'Land, labor, regulatory liaison for Chinese partner.',
      export_centricity: 'GCC export ready within 18 months.',
    }),
    project_overview: JSON.stringify({
      core_activity: 'Automated rice milling and agri-input blending for export.',
      site_location: 'Sheikhupura Industrial Zone, Punjab',
      site_readiness_status: 'Land secured; utilities Q1 2026',
      chinese_technology_sought: 'Chinese automated sorting, milling, packaging line.',
      value_addition_goal: 'Premium export-grade rice derivatives.',
      target_production_capacity: '8,000 MT annual throughput',
      phased_roadmap: 'Permits → equipment → export certification',
      economic_impact: '95 jobs; USD 3M/year FX target.',
      sustainability_metrics: '30% water savings via Chinese recycle system.',
    }),
    financials: JSON.stringify({
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
    }),
    investment_ask: JSON.stringify({
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
    }),
    contact_info: JSON.stringify({
      name: 'Ali Khan',
      designation: 'CEO, GreenTech Pakistan',
      email: MM_PARTY_A,
      cell: '03001234567',
      wechat: '',
    }),
    proposal_file_url: demoFileUrl,
    status: 'submitted',
    submitted_at: new Date(),
  };
}

function buildChinaMatchmakingProposal(investorId, demoFileUrl) {
  return {
    submitted_by_investor: investorId,
    engagement_type: 'B2B',
    sector: SECTOR,
    company_name: 'SinoAgri Corp',
    venture_name: 'DEMO-2 SinoAgri Blending Tech (China side)',
    proposal_title: 'DEMO-2 SinoAgri Blending Tech (China side)',
    project_type: 'Brownfield',
    party_b_entity_type: 'business',
    party_b_name: 'Li Wei',
    party_b_organization: 'SinoAgri Corp',
    party_b_email: 'liwei.demo@sinoagri.cn',
    party_b_phone: '+86-138-0000-5678',
    party_b_country: 'China',
    executive_summary: JSON.stringify({
      company_overview: 'SinoAgri Corp — agri-tech manufacturer seeking Pakistan JV partner.',
      project_overview: 'Precision blending plant and technology export for Pakistan agri-inputs.',
      project_segment: SECTOR,
      sector_alignment: 'Same sector as DEMO-2 GreenTech Pakistan proposal.',
      investment_ask_summary: 'USD 3.8M technology + equipment package for JV setup',
    }),
    company_overview: JSON.stringify({
      years_in_operation: '18',
      key_certifications: 'ISO 9001, ISO 14001',
      infrastructure_assets: '3 manufacturing plants, R&D centre',
      value_chain_scope: 'Raw inputs → blending → packaging → export',
    }),
    project_overview: JSON.stringify({
      core_activity: 'Agri-input blending technology export for Pakistan JV.',
      site_location: 'Jiangsu Province, China',
      target_production_capacity: '6,500 MT annual capacity',
    }),
    financials: JSON.stringify({
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
    }),
    investment_ask: JSON.stringify({
      total_project_cost_usd: '4800000',
      investment_ask_equity_usd: '3800000',
      fund_utilization_technology_pct: '55',
      fund_utilization_infrastructure_pct: '25',
      fund_utilization_working_capital_pct: '20',
    }),
    contact_info: JSON.stringify({
      name: 'Li Wei',
      designation: 'Director, SinoAgri Corp',
      email: INVESTOR_EMAIL,
      cell: '+86-138-0000-5678',
      wechat: 'liwei_sinoagri',
    }),
    proposal_file_url: demoFileUrl,
    status: 'submitted',
    submitted_at: new Date(),
  };
}

async function insertRow(table, row) {
  const cols = Object.keys(row);
  const [result] = await pool.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(row)
  );
  return result.insertId;
}

async function seed() {
  const partyALegacy = await requireUser(LEGACY_PARTY_A, 'Party A (legacy demo)');
  const partyAMm = await requireUser(MM_PARTY_A, 'Party A (matchmaking demo)');
  const investor = await requireUser(INVESTOR_EMAIL, 'Chinese Investor');
  const sectorLead = await requireUser(SECTOR_LEAD_EMAIL, 'Sector Lead');

  if (investor.role !== 'chinese_investor') {
    throw new Error(
      `${INVESTOR_EMAIL} must be chinese_investor. Run: npm run db:migrate:chinese-investor-role && npm run db:seed`
    );
  }

  await pool.query('UPDATE users SET sector = ? WHERE id = ?', [SECTOR, sectorLead.id]);

  console.log('\n--- Clearing transactional data (users kept) ---\n');
  await clearTransactionalData();

  const demoFileUrl = ensureDemoUploadPdf();
  console.log(`Demo upload PDF: ${demoFileUrl}\n`);

  const legacyProposal = buildLegacyAllInOneProposal(partyALegacy.id, demoFileUrl);
  const legacyMissing = validateSubmit(legacyProposal);
  if (legacyMissing.length) {
    throw new Error(`Demo 1 validation: ${legacyMissing.join(', ')}`);
  }
  const legacyId = await insertRow('proposals', legacyProposal);

  const pkProposal = buildPkMatchmakingProposal(partyAMm.id, demoFileUrl);
  const pkMissing = validatePartyAOnlySubmit(pkProposal);
  if (pkMissing.length) {
    throw new Error(`Demo 2 PK validation: ${pkMissing.join(', ')}`);
  }
  const pkId = await insertRow('mm_pakistan_proposals', pkProposal);

  const cnProposal = buildChinaMatchmakingProposal(investor.id, demoFileUrl);
  const cnMissing = validateChinaProposalSubmit(cnProposal);
  if (cnMissing.length) {
    throw new Error(`Demo 2 China validation: ${cnMissing.join(', ')}`);
  }
  const cnId = await insertRow('mm_china_proposals', cnProposal);

  console.log('\n========================================');
  console.log('  DEMO DATA READY (2 records only)');
  console.log('========================================\n');

  console.log('DEMO 1 — Direct Opportunity (Party A fills ALL)');
  console.log(`  Proposal ID:  ${legacyId}  (proposals table)`);
  console.log(`  Login:        ${LEGACY_PARTY_A} / password123`);
  console.log('  Shows:        Party A + Party B + MOU in one 11-step form');
  console.log('  Next step:    sectorlead@test.com → approve\n');

  console.log('DEMO 2 — Matchmaking V2 (Party A + China side SEPARATE)');
  console.log(`  PK Proposal:  ${pkId}  (mm_pakistan_proposals)`);
  console.log(`  CN Proposal:  ${cnId}  (mm_china_proposals)`);
  console.log(`  PK login:     ${MM_PARTY_A} / password123 (same as DEMO 1)`);
  console.log(`  CN login:     ${INVESTOR_EMAIL} / password123`);
  console.log('  Next steps:');
  console.log('    rfp@test.com         → shortlist + forward China');
  console.log('    sectorlead@test.com  → shortlist PK + create match\n');

  console.log('All users preserved. Password for all: password123');
  console.log('========================================\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Demo reset failed:', err.message);
  process.exit(1);
});

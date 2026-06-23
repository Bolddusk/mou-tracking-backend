/**
 * Full database reset + fresh demo data:
 * 1. All test users (same emails / password123)
 * 2. One Direct MOU opportunity (proposals — submitted)
 * 3. Two matchmaking proposals: Pakistan side_a + China side_b (submitted)
 *
 * Run: npm run db:seed:fresh
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { validateSubmit } = require('../utils/proposalTemplate');

const PASSWORD = 'password123';
const SECTOR = 'Agri-chemicals & Inputs';
const DEMO_FILE = 'demo-seed.pdf';

const TEST_USERS = [
  {
    full_name: 'Party A Test User',
    email: 'partya@test.com',
    role: 'party_a',
    sector: null,
    country: 'Pakistan',
    organization: 'Test Organization',
    phone: '03001234567',
  },
  {
    full_name: 'Party A — Sara Ahmed',
    email: 'partya2@test.com',
    role: 'party_a',
    sector: null,
    country: 'Pakistan',
    organization: 'GreenTech Pakistan',
    phone: '03009876543',
  },
  {
    full_name: 'Hasnain Lodhi',
    email: 'sectorlead@test.com',
    role: 'sector_lead',
    sector: SECTOR,
    country: 'Pakistan',
    organization: 'Ministry of National Food Security & Research',
    phone: '03007654321',
  },
  {
    full_name: 'Super Admin',
    email: 'superadmin@test.com',
    role: 'super_admin',
    sector: null,
    country: null,
    organization: 'Investment Portal HQ',
    phone: '03009998877',
  },
  {
    full_name: 'PK Focal Point',
    email: 'rfp@test.com',
    role: 'focal_point',
    sector: null,
    country: 'Pakistan',
    organization: 'Pakistan Investment Promotion',
    phone: '03001112233',
  },
  {
    full_name: 'CN Focal Point',
    email: 'rfp2@test.com',
    role: 'focal_point',
    sector: null,
    country: 'China',
    organization: 'China Investment Promotion',
    phone: '03004445566',
  },
  {
    full_name: 'Li Wei — SinoAgri',
    email: 'investor@test.com',
    role: 'investor',
    sector: null,
    country: 'China',
    organization: 'SinoAgri Corp',
    phone: '+86-138-0000-5678',
  },
];

const CLEAR_TABLES = [
  'activity_comments',
  'activity_approvals',
  'complaint_party_b_engagements',
  'complaint_comments',
  'complaint_actions',
  'proposal_chat_messages',
  'proposal_activities',
  'mou_file_versions',
  'complaints',
  'mm_matches',
  'mm_proposals',
  'proposals',
  'sl_reassignments',
  'compliance_filings',
  'party_a_profile_documents',
  'party_a_profiles',
  'users',
];

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n100\n%%EOF\n'
);

function ensureDemoFileUrl() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(uploadsDir, DEMO_FILE), MINIMAL_PDF);
  const host = (process.env.API_HOST || 'http://localhost:5000').replace(/\/$/, '');
  return `${host}/uploads/${DEMO_FILE}`;
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function clearDatabase() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of CLEAR_TABLES) {
    if (await tableExists(table)) {
      await pool.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`Cleared: ${table}`);
    }
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function seedUsers() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const ids = {};

  for (const user of TEST_USERS) {
    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password, role, sector, organization, phone, country, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        user.full_name,
        user.email,
        hashedPassword,
        user.role,
        user.sector,
        user.organization,
        user.phone,
        user.country,
      ]
    );
    ids[user.email] = result.insertId;
    console.log(`User: ${user.email} (${user.role}) id=${result.insertId}`);
  }

  return ids;
}

function buildDirectMouProposal(partyAId, fileUrl) {
  return {
    party_a_id: partyAId,
    engagement_type: 'B2B',
    conference_info: JSON.stringify({
      conference_name: 'Pak-China Agri-Investment Conference 2026',
      conference_date: '2026-09-15',
      conference_end_date: '2026-09-17',
      conference_location: 'Islamabad, Pakistan',
      conference_host: 'Ministry of National Food Security & Research',
      conference_description: 'Direct opportunity — Party A submits full form including Party B and MOU.',
    }),
    party_a_info: JSON.stringify({
      entity_type: 'business',
      organization_name: 'Khan Industries Pvt Ltd',
      contact_name: 'Ali Khan',
      designation: 'CEO',
      email: 'partya@test.com',
      phone: '03001234567',
      country: 'Pakistan',
      city: 'Lahore',
    }),
    party_b_entity_type: 'business',
    sector: SECTOR,
    company_name: 'Khan Industries Pvt Ltd',
    venture_name: 'Direct MOU — Khan AgriChem Hub',
    proposal_title: 'Direct MOU — Khan AgriChem Hub',
    project_type: 'Greenfield',
    executive_summary: JSON.stringify({
      company_overview: 'Khan Industries — nationwide agri-inputs distributor.',
      project_overview: 'Formulation and packaging plant for crop protection products.',
      project_segment: SECTOR,
      sector_alignment: 'Pak-China Agri-Investment Conference 2026.',
      investment_ask_summary: 'USD 8.5M equity + USD 2M debt',
    }),
    company_overview: JSON.stringify({
      years_in_operation: '18',
      market_standing_pakistan: 'Top-5 regional player in Punjab and Sindh.',
      key_certifications: 'ISO 9001, ISO 14001',
      infrastructure_assets: 'Warehouse cluster, QC lab',
      land_project_capacity: '45 acres; 12,000 MT/year',
      value_chain_scope: 'Import → formulation → packaging → distribution',
      local_provisions: 'Land, labor, regulatory liaison',
      export_centricity: 'ASEAN export readiness within 24 months',
    }),
    project_overview: JSON.stringify({
      core_activity: 'Agri-chemical formulation and packaging hub.',
      site_location: 'M-3 Industrial City, Punjab',
      site_readiness_status: 'Land acquired',
      chinese_technology_sought: 'Automated formulation line from Chinese OEM.',
      value_addition_goal: 'Finished crop protection products',
      target_production_capacity: '12,000 MT annual throughput',
      phased_roadmap: 'Civil works → equipment → production',
      economic_impact: '180 direct jobs',
      sustainability_metrics: '25% energy reduction',
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
      milestone_phase_1: 'Site preparation and approvals.',
      milestone_phase_2: 'Equipment install.',
      milestone_phase_3: 'Commercial operations.',
      sponsor_contribution_pkr_mn: '890',
      raising_from_investors_pkr_mn: '2380',
      total_funds_required_pkr_mn: '3270',
    }),
    contact_info: JSON.stringify({
      name: 'Ali Khan',
      designation: 'CEO',
      email: 'partya@test.com',
      cell: '03001234567',
      wechat: 'AliKhan_KI2026',
    }),
    proposal_file_url: fileUrl,
    party_b_name: 'Zhang Wei',
    party_b_organization: 'SinoAgro Technologies Ltd',
    party_b_email: 'zhangwei.demo@sinoagro.cn',
    party_b_phone: '+86-138-0000-1234',
    party_b_country: 'China',
    mou_scope: 'Technology transfer and joint formulation standards',
    mou_description: 'MOU covers Chinese formulation line, training, and export co-development.',
    mou_sector: SECTOR,
    mou_demand: 'Chinese partner equipment and process license.',
    mou_file_url: fileUrl,
    mou_status: 'uploaded',
    status: 'submitted',
    submitted_at: new Date(),
  };
}

function buildMmBusinessKeywords({
  fileUrl,
  engagementType = 'B2B',
  ventureName,
  companyName,
  description,
  country,
  submitterInfo,
  conferenceInfo,
  executiveSummary,
  companyOverview,
  projectOverview,
  financials,
  investmentAsk,
  contactInfo,
  projectType = 'Greenfield',
}) {
  return JSON.stringify({
    file_url: fileUrl,
    proposal_file_url: fileUrl,
    engagement_type: engagementType,
    venture_name: ventureName,
    company_name: companyName,
    project_type: projectType,
    conference_info: conferenceInfo,
    submitter_info: submitterInfo,
    executive_summary: executiveSummary,
    company_overview: companyOverview,
    project_overview: projectOverview,
    financials,
    investment_ask: investmentAsk,
    contact_info: contactInfo,
    tags: [],
  });
}

function buildMmProposalPakistan(partyAId, fileUrl) {
  const ventureName = 'Pakistan — GreenTech Rice Mill JV';
  return {
    submitted_by: partyAId,
    submitter_role: 'party_a',
    country: 'Pakistan',
    sector: SECTOR,
    title: ventureName,
    description:
      'Automated rice milling and value-addition for export. Seeking Chinese technology partner via matchmaking.',
    investment_amount: 4200000,
    keywords: buildMmBusinessKeywords({
      fileUrl,
      ventureName,
      companyName: 'GreenTech Pakistan',
      description:
        'Automated rice milling and value-addition for export. Seeking Chinese technology partner via matchmaking.',
      country: 'Pakistan',
      conferenceInfo: {
        conference_name: 'Pak-China Agri-Investment Conference 2026',
        conference_date: '2026-09-15',
        conference_end_date: '2026-09-17',
        conference_location: 'Islamabad, Pakistan',
        conference_host: 'Ministry of National Food Security & Research',
        conference_description: 'Matchmaking Side A — seeking technology partner.',
      },
      submitterInfo: {
        entity_type: 'business',
        organization_name: 'GreenTech Pakistan',
        contact_name: 'Party A Test User',
        designation: 'CEO',
        email: 'partya@test.com',
        phone: '03001234567',
        country: 'Pakistan',
        city: 'Lahore',
      },
      executiveSummary: {
        company_overview: 'GreenTech Pakistan — rice processing and export.',
        project_overview: 'Automated rice milling plant with Chinese technology.',
        project_segment: SECTOR,
        sector_alignment: 'Pak-China Agri-Investment Conference 2026.',
        investment_ask_summary: 'USD 4.2M equity partnership',
      },
      companyOverview: {
        years_in_operation: '12',
        market_standing_pakistan: 'Regional rice exporter.',
        key_certifications: 'ISO 9001',
        infrastructure_assets: 'Processing units in Punjab',
        land_project_capacity: '25 acres; 8,000 MT/year',
        value_chain_scope: 'Milling → packaging → export',
        local_provisions: 'Land, labor, distribution',
        export_centricity: 'Middle East export focus',
      },
      projectOverview: {
        core_activity: 'Rice milling and value addition.',
        site_location: 'Sheikhupura, Punjab',
        site_readiness_status: 'Land secured',
        chinese_technology_sought: 'Automated sorting and milling line.',
        value_addition_goal: 'Premium export-grade rice',
        target_production_capacity: '8,000 MT annual throughput',
        phased_roadmap: 'Civil works → equipment → production',
        economic_impact: '120 direct jobs',
        sustainability_metrics: '20% water recycling',
      },
      financials: {
        years: [
          {
            label: 'FY 2024',
            metrics: {
              total_revenue: '980',
              ebitda: '145',
              net_income: '62',
              total_assets: '1100',
              total_debt: '220',
              shareholder_equity: '540',
              gross_profit_margin: '22',
              ebitda_margin: '15',
              return_on_equity: '11',
              current_ratio: '1.4',
              debt_to_equity: '0.41',
            },
          },
        ],
        additional_rows: [],
      },
      investmentAsk: {
        total_project_cost_usd: '4200000',
        investment_ask_equity_usd: '3200000',
        investment_ask_debt_usd: '1000000',
        sponsor_contribution_type: 'Land and existing plant',
        sponsor_contribution_amount: 'USD 1.2M equivalent',
        fund_utilization_technology_pct: '50',
        fund_utilization_infrastructure_pct: '30',
        fund_utilization_working_capital_pct: '20',
        projected_irr_pct: '19',
        payback_period_years: '7',
        milestone_phase_1: 'Site preparation.',
        milestone_phase_2: 'Equipment install.',
        milestone_phase_3: 'Commercial operations.',
        sponsor_contribution_pkr_mn: '340',
        raising_from_investors_pkr_mn: '900',
        total_funds_required_pkr_mn: '1240',
      },
      contactInfo: {
        name: 'Party A Test User',
        designation: 'CEO',
        email: 'partya@test.com',
        cell: '03001234567',
        wechat: '',
      },
    }),
    side: 'side_a',
    status: 'submitted',
  };
}

function buildMmProposalChina(investorId, fileUrl) {
  const ventureName = 'China — SinoAgri Blending Technology';
  return {
    submitted_by: investorId,
    submitter_role: 'investor',
    country: 'China',
    sector: SECTOR,
    title: ventureName,
    description:
      'Precision blending plant and technology export for Pakistan JV partner via matchmaking.',
    investment_amount: 3800000,
    keywords: buildMmBusinessKeywords({
      fileUrl,
      ventureName,
      companyName: 'SinoAgri Technologies Ltd',
      description:
        'Precision blending plant and technology export for Pakistan JV partner via matchmaking.',
      country: 'China',
      submitterInfo: {
        entity_type: 'business',
        organization_name: 'SinoAgri Technologies Ltd',
        contact_name: 'Li Wei',
        designation: 'Director',
        email: 'investor@test.com',
        phone: '+86-138-0000-5678',
        country: 'China',
        city: 'Shanghai',
      },
      conferenceInfo: {
        conference_name: 'Pak-China Agri-Investment Conference 2026',
        conference_date: '2026-09-15',
        conference_end_date: '2026-09-17',
        conference_location: 'Islamabad, Pakistan',
        conference_host: 'Ministry of National Food Security & Research',
        conference_description: 'Matchmaking Side B — technology offering.',
      },
      executiveSummary: {
        company_overview: 'SinoAgri — precision agri-chemical blending.',
        project_overview: 'Export blending technology and plant design to Pakistan JV.',
        project_segment: SECTOR,
        sector_alignment: SECTOR,
        investment_ask_summary: 'USD 3.8M technology partnership',
      },
      companyOverview: {
        years_in_operation: '15',
        key_certifications: 'ISO 9001, GMP',
        infrastructure_assets: 'Blending plant and R&D lab',
        value_chain_scope: 'Formulation → blending → export',
      },
      projectOverview: {
        core_activity: 'Agri-chemical blending technology export.',
        site_location: 'Shanghai, China',
        target_production_capacity: '10,000 MT blending capacity',
      },
      financials: {
        years: [
          {
            label: 'FY 2024',
            metrics: {
              total_revenue: '1800',
              ebitda: '320',
              net_income: '140',
              total_assets: '2100',
              total_debt: '400',
              shareholder_equity: '980',
              gross_profit_margin: '28',
              ebitda_margin: '18',
              return_on_equity: '14',
              current_ratio: '1.6',
              debt_to_equity: '0.41',
            },
          },
        ],
        additional_rows: [],
      },
      investmentAsk: {
        total_project_cost_usd: '3800000',
        investment_ask_equity_usd: '2800000',
        fund_utilization_technology_pct: '60',
        fund_utilization_infrastructure_pct: '25',
        fund_utilization_working_capital_pct: '15',
      },
      contactInfo: {
        name: 'Li Wei',
        designation: 'Director',
        email: 'investor@test.com',
        cell: '+86-138-0000-5678',
        wechat: 'LiWei_SinoAgri',
      },
    }),
    side: 'side_b',
    status: 'submitted',
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
  console.log('\n=== Fresh start: clear DB + seed users + demo data ===\n');

  await clearDatabase();
  const userIds = await seedUsers();
  const fileUrl = ensureDemoFileUrl();
  console.log(`\nDemo file: ${fileUrl}\n`);

  const directProposal = buildDirectMouProposal(userIds['partya@test.com'], fileUrl);
  const directMissing = validateSubmit(directProposal);
  if (directMissing.length) {
    throw new Error(`Direct MOU validation failed: ${directMissing.join(', ')}`);
  }
  const directId = await insertRow('proposals', directProposal);
  console.log(`Direct MOU proposal id=${directId} (submitted)`);

  const pkMmId = await insertRow(
    'mm_proposals',
    buildMmProposalPakistan(userIds['partya@test.com'], fileUrl)
  );
  console.log(`Matchmaking PK (side_a) id=${pkMmId} (submitted)`);

  const cnMmId = await insertRow(
    'mm_proposals',
    buildMmProposalChina(userIds['investor@test.com'], fileUrl)
  );
  console.log(`Matchmaking China (side_b) id=${cnMmId} (submitted)`);

  console.log('\n========================================');
  console.log('  FRESH START COMPLETE');
  console.log('========================================\n');
  console.log('All passwords: password123\n');
  console.log('USERS');
  console.log('  partya@test.com       party_a');
  console.log('  partya2@test.com      party_a');
  console.log('  sectorlead@test.com   sector_lead');
  console.log('  superadmin@test.com   super_admin');
  console.log('  rfp@test.com          focal_point (Pakistan)');
  console.log('  rfp2@test.com         focal_point (China)');
  console.log('  investor@test.com     investor (China)\n');
  console.log('DIRECT MOU');
  console.log(`  Proposal #${directId} — login partya@test.com → /proposals/${directId}`);
  console.log('  Next: sectorlead@test.com → approve\n');
  console.log('MATCHMAKING');
  console.log(`  Pakistan side_a #${pkMmId} — partya@test.com → /matchmaking/${pkMmId}`);
  console.log(`  China side_b #${cnMmId} — investor@test.com → /matchmaking/${cnMmId}`);
  console.log('  Next:');
  console.log('    rfp@test.com  → shortlist + forward PK proposal');
  console.log('    rfp2@test.com → shortlist + forward CN proposal');
  console.log('    sectorlead@test.com → matching board → create match\n');
  console.log('========================================\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Fresh start seed failed:', err.message);
  process.exit(1);
});

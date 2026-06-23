require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const MARKER = 'SL-HANDOFF-SEED';

/** Per-sector handoff pack: old SL (reassign), new SL (target), former SL (orphan after demote) */
const SECTOR_PACKS = [
  {
    sector: 'Agri-chemicals & Inputs',
    oldSl: {
      full_name: 'Old SL — Agri (Handoff Test)',
      email: 'oldsl-handoff@test.com',
      password: 'password123',
      role: 'sector_lead',
      organization: 'MNFSR — Former Agri SL',
      phone: '03001111001',
    },
    newSl: {
      full_name: 'Hasnain Lodhi',
      email: 'sectorlead@test.com',
      password: 'password123',
      role: 'sector_lead',
    },
    orphanFormer: {
      full_name: 'Former SL — Agri Orphan',
      email: 'orphan-sl-ref@test.com',
      password: 'password123',
      role: 'sector_lead',
      organization: 'Demoted — invalid Agri SL ref',
      phone: '03001111002',
    },
  },
  {
    sector: 'Food Processing & Value Addition',
    oldSl: {
      full_name: 'Old SL — Food Processing',
      email: 'oldsl-food@test.com',
      password: 'password123',
      role: 'sector_lead',
      organization: 'MNFSR — Former Food SL',
      phone: '03001111003',
    },
    newSl: {
      full_name: 'SL — Food Processing (Active)',
      email: 'sectorlead-food@test.com',
      password: 'password123',
      role: 'sector_lead',
      organization: 'MNFSR Food Sector',
      phone: '03001111004',
    },
    orphanFormer: {
      full_name: 'Former SL — Food Orphan',
      email: 'orphan-sl-food@test.com',
      password: 'password123',
      role: 'sector_lead',
      organization: 'Demoted — invalid Food SL ref',
      phone: '03001111005',
    },
  },
  {
    sector: 'Dairy Inputs & Processed Dairy Products',
    oldSl: {
      full_name: 'Old SL — Dairy',
      email: 'oldsl-dairy@test.com',
      password: 'password123',
      role: 'sector_lead',
      organization: 'MNFSR — Former Dairy SL',
      phone: '03001111006',
    },
    newSl: {
      full_name: 'SL — Dairy (Active)',
      email: 'sectorlead-dairy@test.com',
      password: 'password123',
      role: 'sector_lead',
      organization: 'MNFSR Dairy Sector',
      phone: '03001111007',
    },
    orphanFormer: {
      full_name: 'Former SL — Dairy Orphan',
      email: 'orphan-sl-dairy@test.com',
      password: 'password123',
      role: 'sector_lead',
      organization: 'Demoted — invalid Dairy SL ref',
      phone: '03001111008',
    },
  },
];

async function ensureUser(user, sector) {
  const row = { ...user, sector };
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [row.email]);
  const hash = await bcrypt.hash(row.password, 10);

  if (existing.length) {
    await pool.query(
      `UPDATE users SET full_name = ?, role = ?, sector = ?, organization = ?, phone = ? WHERE email = ?`,
      [row.full_name, row.role, row.sector, row.organization || null, row.phone || null, row.email]
    );
    return existing[0].id;
  }

  const [result] = await pool.query(
    `INSERT INTO users (full_name, email, password, role, sector, organization, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [row.full_name, row.email, hash, row.role, row.sector, row.organization || null, row.phone || null]
  );
  return result.insertId;
}

async function requireUser(email) {
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (!rows.length) throw new Error(`Missing user: ${email} — run npm run db:seed first`);
  return rows[0].id;
}

async function findOrCreateProposal(partyAId, sector) {
  const [existing] = await pool.query(
    `SELECT id FROM proposals WHERE party_a_id = ? AND sector = ? AND status = 'approved' LIMIT 1`,
    [partyAId, sector]
  );
  if (existing.length) return existing[0].id;

  const [result] = await pool.query(
    `INSERT INTO proposals (party_a_id, sector, proposal_title, proposal_description, status, submitted_at)
     VALUES (?, ?, ?, ?, 'approved', NOW())`,
    [
      partyAId,
      sector,
      `${MARKER} — ${sector}`,
      `Anchor proposal for ${sector} handoff seed.`,
    ]
  );
  return result.insertId;
}

async function upsertComplaint({ proposalId, filedBy, taggedSl, title, status }) {
  const [existing] = await pool.query(`SELECT id FROM complaints WHERE title = ? LIMIT 1`, [title]);
  if (existing.length) {
    await pool.query(
      `UPDATE complaints SET tagged_sector_lead = ?, status = ?, proposal_id = ? WHERE id = ?`,
      [taggedSl, status, proposalId, existing[0].id]
    );
    return existing[0].id;
  }
  const [result] = await pool.query(
    `INSERT INTO complaints (proposal_id, filed_by, tagged_sector_lead, title, description, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [proposalId, filedBy, taggedSl, title, `${MARKER} handoff test.`, status]
  );
  return result.insertId;
}

async function upsertChinaProposal({ investorId, sector, forwardedToSl, ventureName, status }) {
  const [existing] = await pool.query(
    `SELECT id FROM mm_china_proposals WHERE venture_name = ? LIMIT 1`,
    [ventureName]
  );
  const payload = {
    submitted_by_investor: investorId,
    engagement_type: 'B2B',
    sector,
    venture_name: ventureName,
    company_name: 'Handoff Test Corp',
    proposal_title: ventureName,
    proposal_description: `${MARKER} China proposal — ${sector}`,
    party_b_entity_type: 'business',
    party_b_name: 'Li Wei',
    party_b_organization: 'SinoAgri Corp',
    party_b_email: 'investor@test.com',
    status,
    forwarded_to_sl: forwardedToSl,
    submitted_at: new Date(),
    forwarded_at: new Date(),
  };

  if (existing.length) {
    await pool.query(
      `UPDATE mm_china_proposals SET sector = ?, status = ?, forwarded_to_sl = ?, forwarded_at = NOW() WHERE id = ?`,
      [sector, status, forwardedToSl, existing[0].id]
    );
    return existing[0].id;
  }

  const cols = Object.keys(payload);
  const [result] = await pool.query(
    `INSERT INTO mm_china_proposals (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(payload)
  );
  return result.insertId;
}

function sectorKey(sector) {
  return sector.split(/[^a-zA-Z0-9]+/)[0].toUpperCase();
}

async function seed() {
  console.log(`\n=== SL Handoff MULTI-SECTOR seed (${MARKER}) ===\n`);

  const partyAId = await requireUser('partya@test.com');
  const investorId = await requireUser('investor@test.com');

  const reassignBodies = [];
  const orphanUsers = [];

  for (const pack of SECTOR_PACKS) {
    const { sector } = pack;
    const key = sectorKey(sector);

    const newSlId = await ensureUser(pack.newSl, sector);
    const oldSlId = await ensureUser(pack.oldSl, sector);
    const orphanId = await ensureUser(pack.orphanFormer, sector);
    const proposalId = await findOrCreateProposal(partyAId, sector);

    // Open records on OLD SL → reassign test
    await upsertComplaint({
      proposalId,
      filedBy: partyAId,
      taggedSl: oldSlId,
      title: `${MARKER} — [${key}] Open complaint (reassign)`,
      status: 'open',
    });
    await upsertComplaint({
      proposalId,
      filedBy: partyAId,
      taggedSl: oldSlId,
      title: `${MARKER} — [${key}] Under review (reassign)`,
      status: 'under_review',
    });
    await upsertChinaProposal({
      investorId,
      sector,
      forwardedToSl: oldSlId,
      ventureName: `${MARKER}-CN-${key}-REASSIGN`,
      status: 'forwarded_to_pakistan',
    });

    // Orphan: demote former SL
    await upsertComplaint({
      proposalId,
      filedBy: partyAId,
      taggedSl: orphanId,
      title: `${MARKER} — [${key}] ORPHAN complaint`,
      status: 'open',
    });
    await upsertChinaProposal({
      investorId,
      sector,
      forwardedToSl: orphanId,
      ventureName: `${MARKER}-CN-${key}-ORPHAN`,
      status: 'forwarded_to_pakistan',
    });
    await pool.query(`UPDATE users SET role = 'party_a', sector = NULL WHERE id = ?`, [orphanId]);
    orphanUsers.push({ sector, email: pack.orphanFormer.email, id: orphanId });

    // Closed — stays on old SL
    await upsertComplaint({
      proposalId,
      filedBy: partyAId,
      taggedSl: oldSlId,
      title: `${MARKER} — [${key}] Resolved (no reassign)`,
      status: 'resolved',
    });

    reassignBodies.push({
      sector,
      new_sl_user_id: newSlId,
      new_sl_email: pack.newSl.email,
      old_sl_email: pack.oldSl.email,
      reason: `Handoff test — ${sector}`,
    });

    console.log(`✓ ${sector}`);
    console.log(`    Old SL:    ${pack.oldSl.email} (id ${oldSlId})`);
    console.log(`    New SL:    ${pack.newSl.email} (id ${newSlId})`);
    console.log(`    Orphan:    ${pack.orphanFormer.email} (id ${orphanId}, now party_a)`);
  }

  const [[counts]] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM complaints c LEFT JOIN users u ON u.id = c.tagged_sector_lead
       WHERE u.id IS NULL OR u.role != 'sector_lead') AS orphan_complaints,
      (SELECT COUNT(*) FROM mm_china_proposals c LEFT JOIN users u ON u.id = c.forwarded_to_sl
       WHERE c.forwarded_to_sl IS NOT NULL AND (u.id IS NULL OR u.role != 'sector_lead')) AS orphan_china`
  );

  console.log('\n--- Orphans tab should show ---');
  console.log(`  orphan_complaints:       ${counts.orphan_complaints}  (3 sectors × 1)`);
  console.log(`  orphan_china_proposals:  ${counts.orphan_china}  (3 sectors × 1)`);
  console.log(`  Total orphan rows in UI:   ${Number(counts.orphan_complaints) + Number(counts.orphan_china)}`);

  console.log('\n--- Reassign each sector separately ---');
  reassignBodies.forEach((body, i) => {
    console.log(`\n${i + 1}. PATCH /api/admin/sector-lead/reassign`);
    console.log(JSON.stringify({ sector: body.sector, new_sl_user_id: body.new_sl_user_id, reason: body.reason }, null, 2));
  });

  console.log('\nLogin: superadmin@test.com / password123');
  console.log('Refresh: Sector Lead Handoff → Orphans (expect 6 rows: 3 complaints + 3 china)\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

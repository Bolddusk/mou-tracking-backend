const pool = require('../config/db');
const { getPublicFileUrl } = require('../middleware/upload');
const { stringifyJsonFields, hasValue } = require('../utils/proposalTemplate');
const {
  buildMmProposalDraftUpdates,
  validateMmProposalSubmit,
  enrichMmProposalRow,
  buildEngagementRowFromMatch,
  hasMeaningfulMmDraft,
} = require('../utils/mmProposalTemplate');
const { provisionPartyAForProposal } = require('../utils/partyAProvisioner');
const { provisionPartyBForProposal } = require('../utils/partyBProvisioner');
const {
  getMmProposalForSubmitter,
  getMmProposalById,
  canReviewProposalInCountry,
  canViewMmProposal,
  expectedSideForRole,
  getUserCountry,
} = require('../utils/matchmakingProposalAccess');
const { formatMatch, getMatchById, MATCH_SELECT } = require('./matchmakingMatchController');

const TABLE = 'mm_proposals';
const FORWARD_TARGET_ROLES = ['sector_lead', 'focal_point', 'regional_focal_point'];

const PROPOSAL_SELECT = `
  SELECT p.*,
    u.full_name AS submitted_by_name,
    u.email AS submitted_by_email,
    fwd.full_name AS forwarded_to_name,
    fwd.email AS forwarded_to_email,
    rev.full_name AS reviewed_by_name
  FROM ${TABLE} p
  JOIN users u ON u.id = p.submitted_by
  LEFT JOIN users fwd ON fwd.id = p.forwarded_to
  LEFT JOIN users rev ON rev.id = p.reviewed_by
`;

function parseKeywords(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function formatProposalRow(row) {
  if (!row) return null;
  return enrichMmProposalRow(row);
}

async function resolveMmOwner(req, body) {
  if (req.user.role === 'super_admin') {
    const ownerId = Number(body.party_a_id || body.investor_id);
    if (!ownerId) return null;
    const [rows] = await pool.query(
      'SELECT id, role, full_name, email, country FROM users WHERE id = ?',
      [ownerId]
    );
    return rows[0] || null;
  }
  const [rows] = await pool.query(
    'SELECT id, role, full_name, email, country FROM users WHERE id = ?',
    [req.user.id]
  );
  return rows[0] || {
    id: req.user.id,
    role: req.user.role,
    full_name: req.user.full_name,
    email: req.user.email,
    country: req.user.country || null,
  };
}

function ensureMmDraftScalars(updates, body, submitter) {
  const out = { ...updates };
  let kw = {};
  try {
    kw = typeof out.keywords === 'string' ? JSON.parse(out.keywords) : {};
  } catch {
    kw = {};
  }

  if (!hasValue(out.title)) {
    out.title =
      body.venture_name ||
      body.company_name ||
      body.title ||
      kw.venture_name ||
      kw.company_name ||
      'Draft';
  }

  if (!hasValue(out.sector)) {
    out.sector = body.sector || 'Unspecified';
  }

  if (!hasValue(out.country)) {
    out.country = body.country || submitter?.country || 'Unspecified';
  }

  return out;
}

async function attachMatchEngagementInfo(proposals) {
  const list = Array.isArray(proposals) ? proposals.filter(Boolean) : [proposals].filter(Boolean);
  if (!list.length) return proposals;

  const ids = list.map((p) => p.id);
  const placeholders = ids.map(() => '?').join(', ');
  const [matches] = await pool.query(
    `SELECT id, side_a_proposal_id, side_b_proposal_id, engagement_proposal_id, mou_status
     FROM mm_matches
     WHERE side_a_proposal_id IN (${placeholders})
        OR side_b_proposal_id IN (${placeholders})`,
    [...ids, ...ids]
  );

  const byProposalId = new Map();
  for (const match of matches) {
    byProposalId.set(match.side_a_proposal_id, match);
    byProposalId.set(match.side_b_proposal_id, match);
  }

  const enrich = (p) => {
    const match = byProposalId.get(p.id);
    if (!match) return p;
    return {
      ...p,
      match_id: match.id,
      engagement_proposal_id: match.engagement_proposal_id
        ? Number(match.engagement_proposal_id)
        : null,
      match_mou_status: match.mou_status,
    };
  };

  if (Array.isArray(proposals)) {
    return list.map(enrich);
  }
  return enrich(list[0]);
}

async function fetchProposalRow(proposalId) {
  const [rows] = await pool.query(`${PROPOSAL_SELECT} WHERE p.id = ?`, [proposalId]);
  return formatProposalRow(rows[0]);
}

async function createEngagementFromMatch(sideA, sideB, matcherId) {
  const [sideAUserRows] = await pool.query('SELECT * FROM users WHERE id = ?', [
    sideA.submitted_by,
  ]);
  const [sideBUserRows] = await pool.query('SELECT * FROM users WHERE id = ?', [
    sideB.submitted_by,
  ]);
  const sideAUser = sideAUserRows[0];
  const sideBUser = sideBUserRows[0];

  const row = buildEngagementRowFromMatch(sideA, sideB, sideAUser, sideBUser, matcherId);
  const prepared = stringifyJsonFields(row);
  const cols = Object.keys(prepared);
  const [result] = await pool.query(
    `INSERT INTO proposals (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    Object.values(prepared)
  );
  return result.insertId;
}

async function saveDraft(req, res) {
  try {
    const { proposal_id: proposalId, ...body } = req.body;
    const expectedSide = expectedSideForRole(req.user.role);

    if (body.side && expectedSide && body.side !== expectedSide) {
      return res.status(400).json({
        error: `Your role must submit proposals on ${expectedSide}`,
      });
    }

    if (proposalId) {
      const existing = await getMmProposalForSubmitter(proposalId, req.user);
      if (!existing) {
        return res.status(404).json({ error: 'Proposal not found' });
      }
      if (existing.status !== 'draft') {
        return res.status(400).json({ error: 'Only draft proposals can be edited' });
      }

      const updates = buildMmProposalDraftUpdates(body, existing.keywords);
      if (Object.keys(updates).length > 0) {
        const setClause = Object.keys(updates)
          .map((k) => `${k} = ?`)
          .join(', ');
        await pool.query(`UPDATE ${TABLE} SET ${setClause} WHERE id = ?`, [
          ...Object.values(updates),
          proposalId,
        ]);
      }

      return res.json({ proposal_id: Number(proposalId), status: 'draft' });
    }

    const side = body.side || expectedSide;
    if (!side) {
      return res.status(400).json({ error: 'side is required' });
    }

    const owner = await resolveMmOwner(req, body);
    if (req.user.role === 'super_admin' && !owner) {
      return res.status(400).json({
        error: 'party_a_id (Side A) or investor_id (Side B) is required for super admin create',
      });
    }

    const submitter = owner || {
      id: req.user.id,
      role: req.user.role,
      full_name: req.user.full_name,
      email: req.user.email,
      country: req.user.country || null,
    };

    if (!hasMeaningfulMmDraft(body)) {
      return res.status(400).json({
        error:
          'Nothing to save yet. Enter form details, then use Save as Draft or Save & Next.',
      });
    }

    let updates = buildMmProposalDraftUpdates({ ...body, side });
    delete updates.side;
    updates = ensureMmDraftScalars(updates, body, submitter);

    const cols = [
      'submitted_by',
      'submitter_role',
      'status',
      'side',
      ...Object.keys(updates),
    ];
    const values = [submitter.id, submitter.role, 'draft', side, ...Object.values(updates)];

    const [result] = await pool.query(
      `INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      values
    );

    const response = {
      proposal_id: result.insertId,
      status: 'draft',
    };
    if (req.user.role === 'super_admin' && owner) {
      response.created_on_behalf_of = owner.full_name;
      response.created_on_behalf_of_email = owner.email;
    }

    return res.status(201).json(response);
  } catch (err) {
    console.error('MM save draft error:', err.message);
    return res.status(500).json({ error: 'Failed to save draft' });
  }
}

async function submitProposal(req, res) {
  try {
    const { proposal_id: proposalId } = req.body;
    if (!proposalId) {
      return res.status(400).json({ error: 'proposal_id is required' });
    }

    const proposal = await getMmProposalForSubmitter(proposalId, req.user);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (proposal.status !== 'draft') {
      return res.status(400).json({ error: 'Proposal already submitted' });
    }

    const missing = validateMmProposalSubmit(proposal);
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missing_fields: missing,
        fields: missing,
      });
    }

    await pool.query(`UPDATE ${TABLE} SET status = 'submitted' WHERE id = ?`, [proposalId]);

    const updated = await fetchProposalRow(proposalId);
    return res.json(updated);
  } catch (err) {
    console.error('MM submit proposal error:', err.message);
    return res.status(500).json({ error: 'Failed to submit proposal' });
  }
}

async function uploadFile(req, res) {
  try {
    const file = req.files?.proposal_file?.[0] || req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded. Use proposal_file' });
    }
    const file_url = getPublicFileUrl(req, file.filename);
    return res.json({ file_url });
  } catch (err) {
    console.error('MM upload error:', err.message);
    return res.status(500).json({ error: 'File upload failed' });
  }
}

async function getProposalDetail(req, res) {
  try {
    const proposal = await getMmProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (!(await canViewMmProposal(req, proposal))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const formatted = await attachMatchEngagementInfo(await fetchProposalRow(req.params.id));
    return res.json({ proposal: formatted });
  } catch (err) {
    console.error('MM proposal detail error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposal' });
  }
}

async function getMyProposals(req, res) {
  try {
    const [rows] = await pool.query(
      `${PROPOSAL_SELECT} WHERE p.submitted_by = ? ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    const proposals = await attachMatchEngagementInfo(rows.map(formatProposalRow));
    return res.json({ proposals, count: proposals.length });
  } catch (err) {
    console.error('MM my proposals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}

const FOCAL_POINT_QUEUE_STATUSES = ['submitted', 'shortlisted', 'forwarded', 'rejected', 'matched'];
const ALL_MM_PROPOSAL_STATUSES = ['draft', ...FOCAL_POINT_QUEUE_STATUSES];

async function getFocalPointQueue(req, res) {
  try {
    const status = String(req.query.status || '').trim();
    const isSuperAdmin = req.user.role === 'super_admin';
    const allowedStatuses = isSuperAdmin ? ALL_MM_PROPOSAL_STATUSES : FOCAL_POINT_QUEUE_STATUSES;
    let query = PROPOSAL_SELECT;
    const params = [];

    if (isSuperAdmin) {
      query += ' WHERE 1=1';
    } else {
      const country = req.user.country || (await getUserCountry(req.user.id));
      if (!country) {
        return res.status(400).json({ error: 'Focal point profile has no country assigned' });
      }
      query += ' WHERE p.country = ?';
      params.push(country);
    }

    if (status) {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      query += ' AND p.status = ?';
      params.push(status);
    } else {
      query += ` AND p.status IN (${allowedStatuses.map(() => '?').join(', ')})`;
      params.push(...allowedStatuses);
    }

    query += ' ORDER BY p.created_at DESC';

    const [rows] = await pool.query(query, params);
    return res.json(rows.map(formatProposalRow));
  } catch (err) {
    console.error('MM focal point queue error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}

async function shortlistProposal(req, res) {
  try {
    const proposal = await getMmProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (!(await canReviewProposalInCountry(req, proposal))) {
      return res.status(403).json({ error: 'Access denied — wrong country or role' });
    }
    if (!['submitted', 'forwarded'].includes(proposal.status)) {
      return res.status(400).json({ error: 'Proposal cannot be shortlisted in its current status' });
    }

    await pool.query(
      `UPDATE ${TABLE} SET status = 'shortlisted', reviewed_by = ? WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    const updated = await fetchProposalRow(req.params.id);
    return res.json(updated);
  } catch (err) {
    console.error('MM shortlist error:', err.message);
    return res.status(500).json({ error: 'Failed to shortlist proposal' });
  }
}

async function rejectProposal(req, res) {
  try {
    const { comment } = req.body;
    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'comment is required' });
    }

    const proposal = await getMmProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (!(await canReviewProposalInCountry(req, proposal))) {
      return res.status(403).json({ error: 'Access denied — wrong country or role' });
    }

    const keywords = parseKeywords(proposal.keywords);
    keywords.review_comment = String(comment).trim();
    keywords.rejected_by = req.user.id;
    keywords.rejected_at = new Date().toISOString();

    await pool.query(
      `UPDATE ${TABLE} SET status = 'rejected', reviewed_by = ?, keywords = ? WHERE id = ?`,
      [req.user.id, JSON.stringify(keywords), req.params.id]
    );

    const updated = await fetchProposalRow(req.params.id);
    return res.json(updated);
  } catch (err) {
    console.error('MM reject error:', err.message);
    return res.status(500).json({ error: 'Failed to reject proposal' });
  }
}

async function forwardProposal(req, res) {
  try {
    const forwardToUserId = Number(req.body.forward_to_user_id);
    if (!forwardToUserId) {
      return res.status(400).json({ error: 'forward_to_user_id is required' });
    }

    const proposal = await getMmProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    if (!(await canReviewProposalInCountry(req, proposal))) {
      return res.status(403).json({ error: 'Access denied — wrong country or role' });
    }
    if (proposal.status !== 'shortlisted') {
      return res.status(400).json({ error: 'Proposal must be shortlisted before forwarding' });
    }

    const [targetRows] = await pool.query(
      `SELECT id, role FROM users WHERE id = ? AND role IN (${FORWARD_TARGET_ROLES.map(() => '?').join(', ')})`,
      [forwardToUserId, ...FORWARD_TARGET_ROLES]
    );
    if (!targetRows[0]) {
      return res.status(400).json({
        error: 'forward_to_user_id must reference a sector lead or focal point',
      });
    }

    await pool.query(
      `UPDATE ${TABLE}
       SET status = 'forwarded', forwarded_to = ?, forwarded_at = NOW(), reviewed_by = ?
       WHERE id = ?`,
      [forwardToUserId, req.user.id, req.params.id]
    );

    const updated = await fetchProposalRow(req.params.id);
    return res.json(updated);
  } catch (err) {
    console.error('MM forward error:', err.message);
    return res.status(500).json({ error: 'Failed to forward proposal' });
  }
}

async function getForwardedToMe(req, res) {
  try {
    let query = `${PROPOSAL_SELECT} WHERE p.status = 'forwarded'`;
    const params = [];
    if (req.user.role !== 'super_admin') {
      query += ' AND p.forwarded_to = ?';
      params.push(req.user.id);
    }
    query += ' ORDER BY p.forwarded_at DESC';

    const [rows] = await pool.query(query, params);
    return res.json(rows.map(formatProposalRow));
  } catch (err) {
    console.error('MM forwarded-to-me error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}

async function getAllForMatching(req, res) {
  try {
    const [rows] = await pool.query(
      `${PROPOSAL_SELECT}
       WHERE p.status IN ('forwarded', 'shortlisted')
       ORDER BY p.created_at DESC`
    );
    const proposals = rows.map(formatProposalRow);
    return res.json({
      side_a_proposals: proposals.filter((p) => p.side === 'side_a'),
      side_b_proposals: proposals.filter((p) => p.side === 'side_b'),
    });
  } catch (err) {
    console.error('MM all-for-matching error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals for matching' });
  }
}

async function createMatch(req, res) {
  try {
    const sideAId = Number(req.body.side_a_proposal_id);
    const sideBId = Number(req.body.side_b_proposal_id);

    if (!sideAId || !sideBId) {
      return res.status(400).json({
        error: 'side_a_proposal_id and side_b_proposal_id are required',
      });
    }

    const sideA = await getMmProposalById(sideAId);
    const sideB = await getMmProposalById(sideBId);

    if (!sideA) {
      return res.status(404).json({ error: 'Side A proposal not found' });
    }
    if (!sideB) {
      return res.status(404).json({ error: 'Side B proposal not found' });
    }
    if (sideA.side !== 'side_a') {
      return res.status(400).json({ error: 'side_a_proposal_id must reference a side_a proposal' });
    }
    if (sideB.side !== 'side_b') {
      return res.status(400).json({ error: 'side_b_proposal_id must reference a side_b proposal' });
    }
    if (!['forwarded', 'shortlisted'].includes(sideA.status)) {
      return res.status(400).json({ error: 'Side A proposal is not available for matching' });
    }
    if (!['forwarded', 'shortlisted'].includes(sideB.status)) {
      return res.status(400).json({ error: 'Side B proposal is not available for matching' });
    }

    const engagementId = await createEngagementFromMatch(sideA, sideB, req.user.id);

    const [result] = await pool.query(
      `INSERT INTO mm_matches (
         side_a_proposal_id, side_b_proposal_id,
         side_a_country, side_b_country,
         matched_by, status, engagement_proposal_id, mou_status
       ) VALUES (?, ?, ?, ?, ?, 'active', ?, 'not_started')`,
      [sideAId, sideBId, sideA.country, sideB.country, req.user.id, engagementId]
    );

    await pool.query(`UPDATE ${TABLE} SET status = 'matched' WHERE id IN (?, ?)`, [
      sideAId,
      sideBId,
    ]);

    const [engagementRows] = await pool.query('SELECT * FROM proposals WHERE id = ?', [
      engagementId,
    ]);
    const [partyAResult, partyBResult] = await Promise.all([
      provisionPartyAForProposal(engagementRows[0]),
      provisionPartyBForProposal(engagementRows[0]),
    ]);

    const match = await getMatchById(result.insertId);
    return res.status(201).json({
      ...formatMatch(match),
      engagement_proposal_id: engagementId,
      party_a: partyAResult,
      party_b: partyBResult,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'These proposals are already matched' });
    }
    console.error('MM create match error:', err.message);
    return res.status(500).json({ error: 'Failed to create match' });
  }
}

async function getMatcherMatches(req, res) {
  try {
    const [rows] = await pool.query(
      `${MATCH_SELECT} WHERE m.matched_by = ? ORDER BY m.created_at DESC`,
      [req.user.id]
    );
    return res.json(rows.map(formatMatch));
  } catch (err) {
    console.error('MM matcher matches error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch matches' });
  }
}

async function getMyMatches(req, res) {
  try {
    const [rows] = await pool.query(
      `${MATCH_SELECT}
       WHERE sa.submitted_by = ? OR sb.submitted_by = ?
       ORDER BY m.created_at DESC`,
      [req.user.id, req.user.id]
    );
    return res.json(rows.map(formatMatch));
  } catch (err) {
    console.error('MM my matches error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch matches' });
  }
}

async function getAllMatches(req, res) {
  try {
    const [rows] = await pool.query(`${MATCH_SELECT} ORDER BY m.created_at DESC`);
    return res.json(rows.map(formatMatch));
  } catch (err) {
    console.error('MM all matches error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch matches' });
  }
}

module.exports = {
  saveDraft,
  submitProposal,
  uploadFile,
  getProposalDetail,
  getMyProposals,
  getFocalPointQueue,
  shortlistProposal,
  rejectProposal,
  forwardProposal,
  getForwardedToMe,
  getAllForMatching,
  createMatch,
  getMatcherMatches,
  getMyMatches,
  getAllMatches,
};

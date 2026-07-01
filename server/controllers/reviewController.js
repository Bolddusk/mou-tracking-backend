const pool = require('../config/db');
const { checkProposalAccess, buildProposalCapabilities } = require('../utils/proposalAccess');
const { attachPokeStatus } = require('../utils/pokeStatus');
const { enrichProposals, enrichProposalRow } = require('../utils/proposalTemplate');
const { provisionPartyBForProposal } = require('../utils/partyBProvisioner');
const {
  PROPOSAL_STATUSES,
  MOU_STATUSES,
  COOPERATION_MODES,
  COOPERATION_MODE_LABELS,
  getActiveSectorNames,
  PROPOSAL_LIST_FROM_SQL,
  parsePagination,
  validateProposalListQuery,
  buildProposalListWhere,
} = require('../utils/proposalListFilters');
const { ensureSectorCache } = require('../utils/sectorRegistry');

const PROPOSAL_SELECT = `
  SELECT
    p.*,
    pa.full_name AS party_a_name,
    pa.email AS party_a_email,
    pa.organization AS party_a_organization,
    rv.full_name AS reviewed_by_name
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
  LEFT JOIN users rv ON rv.id = p.reviewed_by
`;

const REVIEW_STATUSES = ['submitted', 'resubmitted', 'approved', 'rejected', 'completed'];

async function getProposalById(proposalId) {
  const [rows] = await pool.query(`${PROPOSAL_SELECT} WHERE p.id = ?`, [proposalId]);
  return rows[0] || null;
}

async function getSectorLeadProposals(req, res) {
  try {
    if (!req.user.sector) {
      return res.status(400).json({ error: 'Sector lead profile has no sector assigned' });
    }

    let query;
    const params = [req.user.sector];

    if (req.query.status) {
      if (!REVIEW_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      query = `${PROPOSAL_SELECT} WHERE p.sector = ? AND p.status = ?`;
      params.push(req.query.status);
    } else {
      query = `${PROPOSAL_SELECT} WHERE p.sector = ? AND p.status IN ('submitted', 'resubmitted')`;
    }

    query += ' ORDER BY COALESCE(p.last_resubmitted_at, p.submitted_at) DESC, p.created_at DESC';

    const [rows] = await pool.query(query, params);
    const enriched = enrichProposals(rows);
    const withPoke = await attachPokeStatus(enriched);
    return res.json(withPoke);
  } catch (err) {
    console.error('Sector lead proposals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}

async function getAllProposals(req, res) {
  try {
    await ensureSectorCache();
    const validationErrors = validateProposalListQuery(req.query, getActiveSectorNames());
    if (validationErrors.length) {
      return res.status(400).json({ error: validationErrors[0] });
    }

    const { page, limit, offset } = parsePagination(req.query);
    const { sql, params } = buildProposalListWhere(req.query);

    const countQuery = `SELECT COUNT(*) AS total ${PROPOSAL_LIST_FROM_SQL}${sql}`;
    const [[countRow]] = await pool.query(countQuery, params);
    const total = Number(countRow.total) || 0;
    const totalPages = total ? Math.ceil(total / limit) : 0;

    const dataQuery = `${PROPOSAL_SELECT}${sql} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(dataQuery, [...params, limit, offset]);
    const enriched = enrichProposals(rows);
    const withPoke = await attachPokeStatus(enriched);

    return res.json({
      data: withPoke,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
      filters: {
        conference_key: req.query.conference_key || null,
        cooperation_mode: req.query.cooperation_mode || null,
        status: req.query.status || null,
        sector: req.query.sector || null,
        mou_status: req.query.mou_status || null,
        q: req.query.q || null,
      },
    });
  } catch (err) {
    console.error('All proposals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}

async function getProposalFilterOptions(req, res) {
  try {
    await ensureSectorCache();
    const activeSectors = getActiveSectorNames();
    const [conferences] = await pool.query(
      `SELECT
         conference_key,
         conference_name,
         COUNT(*) AS proposal_count,
         SUM(cooperation_mode = 'mou') AS mou_count,
         SUM(cooperation_mode = 'jv') AS jv_count,
         SUM(cooperation_mode = 'agreement') AS agreement_count
       FROM proposals
       WHERE conference_key IS NOT NULL AND conference_name IS NOT NULL
       GROUP BY conference_key, conference_name
       ORDER BY conference_name ASC`
    );

    return res.json({
      proposal_statuses: PROPOSAL_STATUSES,
      mou_statuses: MOU_STATUSES,
      cooperation_modes: COOPERATION_MODES.map((value) => ({
        value,
        label: COOPERATION_MODE_LABELS[value],
      })),
      conferences: conferences.map((row) => ({
        key: row.conference_key,
        name: row.conference_name,
        proposal_count: Number(row.proposal_count),
        mou_count: Number(row.mou_count),
        jv_count: Number(row.jv_count),
        agreement_count: Number(row.agreement_count),
      })),
      sectors: activeSectors,
      pagination_defaults: {
        page: 1,
        limit: 20,
        max_limit: 100,
      },
    });
  } catch (err) {
    console.error('Proposal filter options error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch filter options' });
  }
}

async function getProposalDetail(req, res) {
  try {
    const proposal = await getProposalById(req.params.id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const parsed = enrichProposalRow(proposal);
    const [withPoke] = await attachPokeStatus([parsed]);
    return res.json({
      ...withPoke,
      capabilities: buildProposalCapabilities(req, proposal, access),
    });
  } catch (err) {
    console.error('Proposal detail error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposal' });
  }
}

async function verifyReviewAccess(req, proposal) {
  if (!proposal) return { error: 'Proposal not found', status: 404 };
  if (!['submitted', 'resubmitted'].includes(proposal.status)) {
    return { error: 'Only submitted proposals can be reviewed', status: 400 };
  }
  if (req.user.role === 'super_admin') {
    return { proposal };
  }
  if (req.user.role === 'sector_lead') {
    if (!req.user.sector) return { error: 'Sector lead profile has no sector assigned', status: 400 };
    if (proposal.sector !== req.user.sector) return { error: 'Access denied — wrong sector', status: 403 };
    return { proposal };
  }
  return { error: 'Access denied', status: 403 };
}

async function approveProposal(req, res) {
  try {
    const proposal = await getProposalById(req.params.id);
    const check = await verifyReviewAccess(req, proposal);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }

    const { comment } = req.body;

    const mouStatusSql = proposal.mou_file_url
      ? `, mou_status = CASE WHEN mou_status IN ('signed','deal_closed') THEN mou_status ELSE 'uploaded' END`
      : proposal.mou_scope
        ? `, mou_status = CASE WHEN mou_status IN ('uploaded','signed','deal_closed') THEN mou_status ELSE 'in_progress' END`
        : '';

    await pool.query(
      `UPDATE proposals
       SET status = 'approved', sector_lead_comment = ?, reviewed_by = ?, reviewed_at = NOW()${mouStatusSql}
       WHERE id = ?`,
      [comment || null, req.user.id, req.params.id]
    );

    const approved = await getProposalById(req.params.id);
    const partyBResult = await provisionPartyBForProposal(approved);
    const updated = await getProposalById(req.params.id);

    let message = 'Proposal approved';
    if (partyBResult.skipped) {
      message = 'Proposal approved (Party B email missing — account not created)';
    } else if (partyBResult.credentials) {
      message = partyBResult.email_sent
        ? 'Proposal approved — Party B credentials also in response'
        : 'Proposal approved — Party B credentials in response (share with Party B)';
    } else if (partyBResult.existing_account) {
      message =
        'Proposal approved, Party B linked to existing account — issue credentials from Users if needed';
    } else if (partyBResult.email_sent) {
      message = 'Proposal approved, Party B credentials sent by email';
    } else if (partyBResult.account_created) {
      message = 'Proposal approved, Party B account created';
    } else if (partyBResult.linked) {
      message = 'Proposal approved, Party B linked';
    }

    return res.json({
      message,
      proposal: updated,
      party_b: partyBResult,
    });
  } catch (err) {
    console.error('Approve proposal error:', err.message);
    return res.status(500).json({ error: 'Failed to approve proposal' });
  }
}

async function rejectProposal(req, res) {
  try {
    const { comment } = req.body;

    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'Comment is required when rejecting' });
    }

    const proposal = await getProposalById(req.params.id);
    const check = await verifyReviewAccess(req, proposal);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }

    await pool.query(
      `UPDATE proposals
       SET status = 'rejected', sector_lead_comment = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [comment.trim(), req.user.id, req.params.id]
    );

    const updated = await getProposalById(req.params.id);
    return res.json(updated);
  } catch (err) {
    console.error('Reject proposal error:', err.message);
    return res.status(500).json({ error: 'Failed to reject proposal' });
  }
}

module.exports = {
  getSectorLeadProposals,
  getAllProposals,
  getProposalFilterOptions,
  getProposalDetail,
  approveProposal,
  rejectProposal,
};

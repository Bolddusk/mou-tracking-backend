const pool = require('../config/db');
const { checkProposalAccess, buildProposalCapabilities } = require('../utils/proposalAccess');
const { loadUserPermissions } = require('../utils/rolePermissions');
const { attachPokeStatus } = require('../utils/pokeStatus');
const { enrichProposals, enrichProposalRow } = require('../utils/proposalTemplate');
const { provisionPartyBForProposal } = require('../utils/partyBProvisioner');
const {
  PROPOSAL_STATUSES,
  MOU_LIFECYCLE_FILTERS,
  COOPERATION_MODES,
  COOPERATION_MODE_LABELS,
  getActiveSectorNames,
  PROPOSAL_LIST_FROM_SQL,
  parsePagination,
  validateProposalListQuery,
  buildProposalListWhere,
  buildListFiltersEcho,
} = require('../utils/proposalListFilters');
const { MOU_LIFECYCLE_LABELS } = require('../utils/mouLifecycle');
const { ensureSectorCache } = require('../utils/sectorRegistry');
const { listActiveSifcCategories } = require('../utils/sifcCategoryRegistry');
const {
  sectorLeadCoversSector,
  sectorLeadHasAnySector,
  getSectorLeadScopedSectors,
} = require('../utils/sectorLeadAssignments');
const { conferenceSupportsReport } = require('../constants/conferences');
const {
  loadPartyAProfileSnapshot,
  loadPartyBProfileSnapshot,
} = require('../utils/partyProfileSnapshots');

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

async function getProposalById(proposalId) {
  const [rows] = await pool.query(`${PROPOSAL_SELECT} WHERE p.id = ?`, [proposalId]);
  return rows[0] || null;
}

async function fetchPaginatedProposalList(req, res, options = {}) {
  await ensureSectorCache();

  const sectorScopes =
    options.sectorScopes?.length > 0
      ? options.sectorScopes
      : options.sectorScope
        ? [options.sectorScope]
        : null;
  const activeSectors = sectorScopes || getActiveSectorNames();

  const validationErrors = validateProposalListQuery(req.query, activeSectors, {
    ignoreSectorFilter: Boolean(sectorScopes?.length),
  });
  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors[0] });
  }

  const { page, limit, offset } = parsePagination(req.query);
  const { sql, params } = buildProposalListWhere(req.query, { sectorScopes, sectorScope: options.sectorScope });

  const countQuery = `SELECT COUNT(*) AS total ${PROPOSAL_LIST_FROM_SQL}${sql}`;
  const [[countRow]] = await pool.query(countQuery, params);
  const total = Number(countRow.total) || 0;
  const totalPages = total ? Math.ceil(total / limit) : 0;

  const orderBy = sectorScopes?.length
    ? ' ORDER BY COALESCE(p.last_resubmitted_at, p.submitted_at, p.created_at) DESC, p.id DESC'
    : ' ORDER BY p.created_at DESC, p.id DESC';

  const dataQuery = `${PROPOSAL_SELECT}${sql}${orderBy} LIMIT ? OFFSET ?`;
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
    filters: buildListFiltersEcho(req.query, { sectorScopes, sectorScope: options.sectorScope }),
  });
}

async function getSectorLeadProposals(req, res) {
  try {
    const sectorScopes = getSectorLeadScopedSectors(req.user);
    if (!sectorScopes.length) {
      return res.status(400).json({ error: 'Sector lead profile has no sector assigned' });
    }

    return fetchPaginatedProposalList(req, res, { sectorScopes });
  } catch (err) {
    console.error('Sector lead proposals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}

async function getAllProposals(req, res) {
  try {
    return fetchPaginatedProposalList(req, res);
  } catch (err) {
    console.error('All proposals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}

async function getProposalFilterOptions(req, res) {
  try {
    await ensureSectorCache();

    const sectorScopes =
      req.user.role === 'sector_lead' ? getSectorLeadScopedSectors(req.user) : null;

    if (req.user.role === 'sector_lead' && !sectorScopes.length) {
      return res.status(400).json({ error: 'Sector lead profile has no sector assigned' });
    }

    const conferenceParams = [];
    let conferenceWhere =
      'WHERE conference_key IS NOT NULL AND conference_name IS NOT NULL';
    if (sectorScopes?.length) {
      conferenceWhere += ` AND sector IN (${sectorScopes.map(() => '?').join(', ')})`;
      conferenceParams.push(...sectorScopes);
    }

    const [conferences] = await pool.query(
      `SELECT
         conference_key,
         conference_name,
         COUNT(*) AS proposal_count,
         SUM(cooperation_mode = 'mou') AS mou_count,
         SUM(cooperation_mode = 'jv') AS jv_count,
         SUM(cooperation_mode = 'agreement') AS agreement_count
       FROM proposals
       ${conferenceWhere}
       GROUP BY conference_key, conference_name
       ORDER BY conference_name ASC`,
      conferenceParams
    );

    const sectors = sectorScopes?.length ? sectorScopes : getActiveSectorNames();
    const sifcCategories = (await listActiveSifcCategories()).map((row) => row.name);

    return res.json({
      proposal_statuses: PROPOSAL_STATUSES,
      mou_lifecycle_statuses: MOU_LIFECYCLE_FILTERS.map((value) => ({
        value,
        label: MOU_LIFECYCLE_LABELS[value],
      })),
      cooperation_modes: COOPERATION_MODES.map((value) => ({
        value,
        label: COOPERATION_MODE_LABELS[value],
      })),
      sifc_categories: sifcCategories,
      conferences: conferences.map((row) => ({
        key: row.conference_key,
        name: row.conference_name,
        proposal_count: Number(row.proposal_count),
        mou_count: Number(row.mou_count),
        jv_count: Number(row.jv_count),
        agreement_count: Number(row.agreement_count),
        supports_report: conferenceSupportsReport(row.conference_key),
      })),
      sectors,
      scoped_sector: sectorScopes?.length === 1 ? sectorScopes[0] : req.user.primary_sector || null,
      scoped_sectors: sectorScopes?.length ? sectorScopes : null,
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
    const [partyAProfile, partyBProfile] = await Promise.all([
      loadPartyAProfileSnapshot(req.user, proposal.party_a_id, proposal),
      loadPartyBProfileSnapshot(req.user, proposal.party_b_user_id, proposal),
    ]);
    const userPermissions = await loadUserPermissions(req.user);
    return res.json({
      ...withPoke,
      capabilities: buildProposalCapabilities(req, proposal, access, userPermissions),
      party_a_profile: partyAProfile,
      party_b_profile: partyBProfile,
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
    if (!sectorLeadHasAnySector(req.user)) {
      return { error: 'Sector lead profile has no sector assigned', status: 400 };
    }
    if (!sectorLeadCoversSector(req.user, proposal.sector)) {
      return { error: 'Access denied — wrong sector', status: 403 };
    }
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

const pool = require('../config/db');
const { getPublicFileUrl } = require('../middleware/upload');
const {
  checkComplaintAccess,
  checkComplaintReviewAccess,
  checkRfpReviewAccess,
  checkEscalateAccess,
  checkReopenAccess,
  canViewInternalTimeline,
  resolveCommentVisibility,
  isComplaintOverdue,
} = require('../utils/complaintAccess');
const {
  getProposalPartyB,
  getEngagementRows,
  enrichEngagementList,
  getPendingPoke,
  getPartyBDocumentsFromEngagement,
  canRfpEngagePartyB,
  canPartyBEngage,
  canViewPartyBEngagement,
} = require('../utils/complaintPartyBEngagement');
const {
  notifyComplaintFiled,
  notifyComplaintStatusChange,
  notifyComplaintComment,
  notifyComplaintEscalated,
} = require('../utils/complaintNotify');

const SLA_DAYS = Math.max(1, Number(process.env.COMPLAINT_SLA_DAYS) || 7);
const COMPLAINT_PRIORITIES = ['low', 'normal', 'high'];
const COMPLAINT_CATEGORIES = [
  'delay',
  'documentation',
  'communication',
  'misconduct',
  'other',
];

const COMPLAINT_SELECT = `
  SELECT c.*,
    p.proposal_title,
    p.sector AS proposal_sector,
    p.company_name AS proposal_company_name,
    p.party_b_name AS proposal_party_b_name,
    pa.full_name AS filed_by_name,
    pa.email AS filed_by_email,
    pa.role AS filed_by_role,
    sl.full_name AS tagged_sector_lead_name,
    sl.email AS tagged_sector_lead_email,
    rfp.full_name AS forwarded_to_name,
    rfp.email AS forwarded_to_email,
    ret.full_name AS returned_by_name,
    pb.full_name AS party_b_name,
    pb.email AS party_b_email
  FROM complaints c
  JOIN proposals p ON p.id = c.proposal_id
  JOIN users pa ON pa.id = c.filed_by
  JOIN users sl ON sl.id = c.tagged_sector_lead
  LEFT JOIN users rfp ON rfp.id = c.forwarded_to
  LEFT JOIN users ret ON ret.id = c.returned_by
  LEFT JOIN users pb ON pb.id = c.party_b_user_id
`;

async function getComplaintByIdRaw(complaintId) {
  const [rows] = await pool.query(`${COMPLAINT_SELECT} WHERE c.id = ?`, [complaintId]);
  return rows[0] || null;
}

async function getUserById(userId) {
  const [rows] = await pool.query('SELECT id, role, full_name, email FROM users WHERE id = ?', [
    userId,
  ]);
  return rows[0] || null;
}

async function getProposalForComplaintFiler(proposalId, user) {
  const [rows] = await pool.query(
    `SELECT id, party_a_id, party_b_user_id, proposal_title, sector, company_name, party_b_name
     FROM proposals WHERE id = ?`,
    [proposalId]
  );
  const proposal = rows[0] || null;
  if (!proposal) return null;

  if (user.role === 'party_a' && proposal.party_a_id === user.id) {
    return proposal;
  }

  if (user.role === 'party_b' && proposal.party_b_user_id === user.id) {
    return proposal;
  }

  return null;
}

/** Resolve Sector Lead for a proposal sector (primary assignment first). */
async function findSectorLeadIdForSector(sector) {
  const name = String(sector || '').trim();
  if (!name) return null;

  const [assigned] = await pool.query(
    `SELECT sla.user_id
     FROM sector_lead_assignments sla
     JOIN users u ON u.id = sla.user_id
     WHERE u.role = 'sector_lead' AND sla.sector = ?
     ORDER BY sla.is_primary DESC, sla.id ASC
     LIMIT 1`,
    [name]
  );
  if (assigned[0]?.user_id) return assigned[0].user_id;

  const [legacy] = await pool.query(
    `SELECT id FROM users WHERE role = 'sector_lead' AND sector = ? ORDER BY id ASC LIMIT 1`,
    [name]
  );
  return legacy[0]?.id || null;
}

function buildComplaintCapabilities(req, complaint) {
  const review = checkComplaintReviewAccess(req, complaint);
  const closed = ['resolved', 'rejected'].includes(complaint.status);
  const escalate = checkEscalateAccess(req, complaint);
  const reopen = checkReopenAccess(req, complaint);
  return {
    can_approve: review.ok && !closed,
    can_reject: review.ok && !closed,
    can_comment: checkComplaintAccess(req, complaint).ok && !closed,
    can_escalate: escalate.ok,
    can_reopen: reopen.ok,
    can_forward: false,
  };
}

function decorateComplaintRow(req, complaint) {
  const overdue = isComplaintOverdue(complaint);
  return {
    ...complaint,
    is_overdue: overdue,
    sla_days: SLA_DAYS,
    outcome:
      complaint.status === 'resolved' || complaint.status === 'rejected'
        ? {
            status: complaint.status,
            comment: complaint.resolution_comment || null,
          }
        : null,
    capabilities: req ? buildComplaintCapabilities(req, complaint) : null,
  };
}

async function findSuperAdminUserIds() {
  const [rows] = await pool.query(
    `SELECT id, email FROM users WHERE role = 'super_admin' ORDER BY id ASC`
  );
  return rows;
}

async function findSuperAdminFallbackId() {
  const rows = await findSuperAdminUserIds();
  return rows[0]?.id || null;
}

async function enrichComplaint(complaint, req) {
  const [allComments] = await pool.query(
    `SELECT cc.*, u.full_name AS commented_by_name
     FROM complaint_comments cc
     JOIN users u ON u.id = cc.commented_by
     WHERE cc.complaint_id = ?
     ORDER BY cc.created_at ASC`,
    [complaint.id]
  );

  const [actions] = await pool.query(
    `SELECT ca.*, u.full_name AS action_by_name
     FROM complaint_actions ca
     JOIN users u ON u.id = ca.action_by
     WHERE ca.complaint_id = ?
     ORDER BY ca.actioned_at ASC`,
    [complaint.id]
  );

  const isTaggedPartyB =
    req &&
    req.user.role === 'party_b' &&
    canPartyBEngage(complaint, req.user.id);

  const showInternal = req && canViewInternalTimeline(req.user.role) && !isTaggedPartyB;
  const publicComments = allComments.filter((c) => c.visibility === 'public');
  const internalTimeline = showInternal
    ? allComments.filter((c) => c.visibility === 'internal')
    : [];

  const partyBTagged = Boolean(complaint.party_b_tagged_at);
  const pendingPoke = partyBTagged ? await getPendingPoke(complaint.id) : null;

  let partyBEngagement = null;
  if (req && canViewPartyBEngagement(req, complaint)) {
    const rows = await getEngagementRows(complaint.id);
    partyBEngagement = {
      tagged: partyBTagged,
      tagged_at: complaint.party_b_tagged_at,
      party_b_user_id: complaint.party_b_user_id,
      party_b_name: complaint.party_b_name || complaint.proposal_party_b_name,
      party_b_email: complaint.party_b_email,
      items: await enrichEngagementList(rows),
      pending_poke_id: pendingPoke?.id || null,
      can_tag_party_b:
        req.user.role === 'regional_focal_point' &&
        complaint.status === 'forwarded' &&
        complaint.forwarded_to === req.user.id &&
        !partyBTagged,
      can_poke_party_b:
        req.user.role === 'regional_focal_point' &&
        partyBTagged &&
        complaint.status === 'forwarded' &&
        complaint.forwarded_to === req.user.id &&
        !pendingPoke,
      can_respond_to_poke:
        isTaggedPartyB && Boolean(pendingPoke),
      can_return_to_sector_lead:
        req.user.role === 'regional_focal_point' &&
        complaint.status === 'forwarded' &&
        complaint.forwarded_to === req.user.id &&
        partyBTagged,
    };
  }

  return {
    ...decorateComplaintRow(req, complaint),
    comments: isTaggedPartyB ? [] : publicComments,
    internal_timeline: internalTimeline,
    actions: isTaggedPartyB ? [] : actions,
    can_view_internal_timeline: showInternal,
    party_b_engagement: partyBEngagement,
  };
}

async function createComplaint(req, res) {
  try {
    const proposalId = Number(req.body.proposal_id);
    const { title, description, document_url, category } = req.body;
    let taggedSectorLead = req.body.tagged_sector_lead
      ? Number(req.body.tagged_sector_lead)
      : null;
    let priority = String(req.body.priority || 'normal').trim().toLowerCase();
    if (!COMPLAINT_PRIORITIES.includes(priority)) priority = 'normal';

    const categoryValue = category ? String(category).trim().toLowerCase() : null;
    if (categoryValue && !COMPLAINT_CATEGORIES.includes(categoryValue)) {
      return res.status(400).json({
        error: `Invalid category. Use: ${COMPLAINT_CATEGORIES.join(', ')}`,
      });
    }

    if (!proposalId || !title?.trim() || !description?.trim()) {
      return res.status(400).json({
        error: 'proposal_id, title, and description are required',
      });
    }

    const proposal = await getProposalForComplaintFiler(proposalId, req.user);
    if (!proposal) {
      return res.status(403).json({ error: 'Proposal not found or access denied' });
    }

    const [dupes] = await pool.query(
      `SELECT id FROM complaints
       WHERE proposal_id = ? AND filed_by = ?
         AND status IN ('open','under_review','escalated')
         AND LOWER(TRIM(title)) = LOWER(?)
       LIMIT 1`,
      [proposalId, req.user.id, title.trim()]
    );
    if (dupes.length) {
      return res.status(409).json({
        error: 'An open complaint with the same title already exists for this MOU',
        existing_complaint_id: dupes[0].id,
      });
    }

    let awaitingSectorLead = 0;
    if (!taggedSectorLead) {
      taggedSectorLead = await findSectorLeadIdForSector(proposal.sector);
    }

    if (!taggedSectorLead) {
      taggedSectorLead = await findSuperAdminFallbackId();
      awaitingSectorLead = 1;
    }

    if (!taggedSectorLead) {
      return res.status(400).json({
        error: 'No sector lead or super admin available to receive this complaint',
        sector: proposal.sector || null,
      });
    }

    const assignee = await getUserById(taggedSectorLead);
    if (!assignee || !['sector_lead', 'super_admin'].includes(assignee.role)) {
      return res.status(400).json({ error: 'Invalid complaint assignee' });
    }
    if (assignee.role === 'super_admin') awaitingSectorLead = 1;

    let docUrl = document_url || null;
    if (req.file) {
      docUrl = getPublicFileUrl(req, req.file.filename, 'complaints');
    }

    const dueAt = new Date(Date.now() + SLA_DAYS * 24 * 60 * 60 * 1000);

    const [result] = await pool.query(
      `INSERT INTO complaints
        (proposal_id, filed_by, tagged_sector_lead, title, description, document_url, status,
         priority, category, due_at, awaiting_sector_lead)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
      [
        proposalId,
        req.user.id,
        taggedSectorLead,
        title.trim(),
        description.trim(),
        docUrl,
        priority,
        categoryValue,
        dueAt,
        awaitingSectorLead,
      ]
    );

    const complaint = await getComplaintByIdRaw(result.insertId);
    const admins = await findSuperAdminUserIds();
    notifyComplaintFiled({
      complaint,
      sectorLeadEmail: assignee.email,
      superAdminEmails: awaitingSectorLead ? admins.map((a) => a.email) : [],
    }).catch(() => {});

    return res.status(201).json(await enrichComplaint(complaint, req));
  } catch (err) {
    console.error('Create complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to create complaint' });
  }
}

async function uploadDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = getPublicFileUrl(req, req.file.filename, 'complaints');
    return res.json({ file_url: fileUrl });
  } catch (err) {
    console.error('Complaint upload error:', err.message);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
}

async function getMyComplaints(req, res) {
  try {
    const [rows] = await pool.query(
      `${COMPLAINT_SELECT} WHERE c.filed_by = ? ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    return res.json(rows.map((row) => decorateComplaintRow(req, row)));
  } catch (err) {
    console.error('Get my complaints error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch complaints' });
  }
}

async function getSectorComplaints(req, res) {
  try {
    const [rows] = await pool.query(
      `${COMPLAINT_SELECT} WHERE c.tagged_sector_lead = ? ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    return res.json(rows.map((row) => decorateComplaintRow(req, row)));
  } catch (err) {
    console.error('Get sector complaints error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch complaints' });
  }
}

async function getForwardedComplaints(req, res) {
  try {
    const [rows] = await pool.query(
      `${COMPLAINT_SELECT} WHERE c.forwarded_to = ? ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    const enriched = await Promise.all(rows.map((row) => enrichComplaint(row, req)));
    return res.json(enriched);
  } catch (err) {
    console.error('Get forwarded complaints error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch complaints' });
  }
}

async function getAllComplaints(req, res) {
  try {
    const conditions = [];
    const params = [];

    if (req.query.status) {
      conditions.push('c.status = ?');
      params.push(String(req.query.status).trim());
    }

    const sectorLeadId = Number(req.query.sector_lead_id || req.query.tagged_sector_lead);
    if (sectorLeadId) {
      conditions.push('c.tagged_sector_lead = ?');
      params.push(sectorLeadId);
    }

    const filedBy = Number(req.query.filed_by || req.query.party_user_id);
    if (filedBy) {
      conditions.push('c.filed_by = ?');
      params.push(filedBy);
    }

    const proposalId = Number(req.query.proposal_id);
    if (proposalId) {
      conditions.push('c.proposal_id = ?');
      params.push(proposalId);
    }

    if (req.query.sector) {
      conditions.push('p.sector = ?');
      params.push(String(req.query.sector).trim());
    }

    if (req.query.company || req.query.q) {
      const term = `%${String(req.query.company || req.query.q).trim()}%`;
      conditions.push(`(
        c.title LIKE ?
        OR p.company_name LIKE ?
        OR p.proposal_title LIKE ?
        OR p.party_b_name LIKE ?
        OR pa.full_name LIKE ?
        OR pa.organization LIKE ?
        OR sl.full_name LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term);
    }

    if (req.query.priority) {
      conditions.push('c.priority = ?');
      params.push(String(req.query.priority).trim().toLowerCase());
    }

    if (req.query.category) {
      conditions.push('c.category = ?');
      params.push(String(req.query.category).trim().toLowerCase());
    }

    if (String(req.query.awaiting_sector_lead || '') === '1' || req.query.awaiting_sector_lead === 'true') {
      conditions.push('c.awaiting_sector_lead = 1');
    }

    if (String(req.query.escalated || '') === '1' || req.query.escalated === 'true') {
      conditions.push(`(c.status = 'escalated' OR c.escalated_at IS NOT NULL)`);
    }

    if (String(req.query.overdue || '') === '1' || req.query.overdue === 'true') {
      conditions.push(
        `c.due_at IS NOT NULL AND c.due_at < NOW() AND c.status IN ('open','under_review','escalated')`
      );
    }

    const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `${COMPLAINT_SELECT}${whereSql} ORDER BY c.created_at DESC`,
      params
    );

    const data = rows.map((row) => decorateComplaintRow(req, row));

    return res.json({
      data,
      filters: {
        status: req.query.status || null,
        sector_lead_id: sectorLeadId || null,
        filed_by: filedBy || null,
        proposal_id: proposalId || null,
        sector: req.query.sector || null,
        priority: req.query.priority || null,
        category: req.query.category || null,
        awaiting_sector_lead: req.query.awaiting_sector_lead || null,
        escalated: req.query.escalated || null,
        overdue: req.query.overdue || null,
        q: req.query.company || req.query.q || null,
      },
      total: data.length,
    });
  } catch (err) {
    console.error('Get all complaints error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch complaints' });
  }
}

async function getComplaintFilterOptions(req, res) {
  try {
    const [sectorLeads] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.sector,
         (SELECT GROUP_CONCAT(sla.sector ORDER BY sla.is_primary DESC, sla.sector SEPARATOR ', ')
          FROM sector_lead_assignments sla WHERE sla.user_id = u.id) AS assigned_sectors
       FROM users u
       WHERE u.role = 'sector_lead'
       ORDER BY u.full_name ASC`
    );

    const [filers] = await pool.query(
      `SELECT DISTINCT u.id, u.full_name, u.email, u.role, u.organization
       FROM complaints c
       JOIN users u ON u.id = c.filed_by
       ORDER BY u.full_name ASC`
    );

    const [sectors] = await pool.query(
      `SELECT DISTINCT p.sector AS sector
       FROM complaints c
       JOIN proposals p ON p.id = c.proposal_id
       WHERE p.sector IS NOT NULL AND p.sector != ''
       ORDER BY p.sector ASC`
    );

    return res.json({
      statuses: [
        { value: 'open', label: 'Open' },
        { value: 'under_review', label: 'Under review' },
        { value: 'escalated', label: 'Escalated' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'rejected', label: 'Rejected' },
      ],
      priorities: COMPLAINT_PRIORITIES.map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      })),
      categories: COMPLAINT_CATEGORIES.map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      })),
      sector_leads: sectorLeads.map((row) => ({
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        sector: row.sector,
        assigned_sectors: row.assigned_sectors
          ? String(row.assigned_sectors).split(', ').filter(Boolean)
          : row.sector
            ? [row.sector]
            : [],
      })),
      parties: filers.map((row) => ({
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        role: row.role,
        organization: row.organization,
      })),
      sectors: sectors.map((row) => row.sector),
    });
  } catch (err) {
    console.error('Get complaint filter options error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch complaint filter options' });
  }
}

async function getComplaintById(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    const access = checkComplaintAccess(req, complaint);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    return res.json(await enrichComplaint(complaint, req));
  } catch (err) {
    console.error('Get complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch complaint' });
  }
}

async function approveComplaint(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    const access = checkComplaintReviewAccess(req, complaint);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (['resolved', 'rejected'].includes(complaint.status)) {
      return res.status(400).json({ error: 'Complaint is already closed' });
    }

    const { comment } = req.body;
    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'Comment is required when resolving a complaint' });
    }
    const resolutionComment = String(comment).trim();

    await pool.query(
      `UPDATE complaints
       SET status = 'resolved', resolution_comment = ?, awaiting_sector_lead = 0
       WHERE id = ?`,
      [resolutionComment, req.params.id]
    );

    await pool.query(
      `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'approved', ?)`,
      [req.params.id, req.user.id, req.user.role, resolutionComment]
    );

    await pool.query(
      `INSERT INTO complaint_comments
        (complaint_id, commented_by, commented_by_role, comment, visibility)
       VALUES (?, ?, ?, ?, 'public')`,
      [req.params.id, req.user.id, req.user.role, resolutionComment]
    );

    const updated = await getComplaintByIdRaw(req.params.id);
    notifyComplaintStatusChange({
      complaint: updated,
      filerEmail: updated.filed_by_email,
      sectorLeadEmail: updated.tagged_sector_lead_email,
      outcomeLabel: 'resolved',
      comment: resolutionComment,
    }).catch(() => {});

    return res.json(await enrichComplaint(updated, req));
  } catch (err) {
    console.error('Approve complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to approve complaint' });
  }
}

async function rejectComplaint(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    const access = checkComplaintReviewAccess(req, complaint);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (['resolved', 'rejected'].includes(complaint.status)) {
      return res.status(400).json({ error: 'Complaint is already closed' });
    }

    const { comment } = req.body;
    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'Comment is required when rejecting' });
    }
    const resolutionComment = String(comment).trim();

    await pool.query(
      `UPDATE complaints
       SET status = 'rejected', resolution_comment = ?, awaiting_sector_lead = 0
       WHERE id = ?`,
      [resolutionComment, req.params.id]
    );

    await pool.query(
      `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'rejected', ?)`,
      [req.params.id, req.user.id, req.user.role, resolutionComment]
    );

    await pool.query(
      `INSERT INTO complaint_comments
        (complaint_id, commented_by, commented_by_role, comment, visibility)
       VALUES (?, ?, ?, ?, 'public')`,
      [req.params.id, req.user.id, req.user.role, resolutionComment]
    );

    const updated = await getComplaintByIdRaw(req.params.id);
    notifyComplaintStatusChange({
      complaint: updated,
      filerEmail: updated.filed_by_email,
      sectorLeadEmail: updated.tagged_sector_lead_email,
      outcomeLabel: 'rejected',
      comment: resolutionComment,
    }).catch(() => {});

    return res.json(await enrichComplaint(updated, req));
  } catch (err) {
    console.error('Reject complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to reject complaint' });
  }
}

async function forwardComplaint(req, res) {
  return res.status(403).json({
    error: 'Forward to Regional FP is disabled — use Resolve, Reject, or Comment only',
  });
}

async function returnToSectorLead(req, res) {
  return res.status(403).json({
    error: 'Regional FP return flow is disabled — use Resolve, Reject, or Comment only',
  });
}

async function tagPartyB(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    const access = checkRfpReviewAccess(req, complaint);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (complaint.party_b_tagged_at) {
      return res.status(400).json({ error: 'Party B is already tagged on this complaint' });
    }

    const proposal = await getProposalPartyB(complaint.proposal_id);
    if (!proposal?.party_b_user_id) {
      return res.status(400).json({
        error: 'This proposal has no linked Party B user. Approve proposal with Party B first.',
      });
    }

    const { comment } = req.body;

    await pool.query(
      `UPDATE complaints
       SET party_b_user_id = ?,
           party_b_tagged_at = NOW(),
           party_b_tagged_by = ?
       WHERE id = ?`,
      [proposal.party_b_user_id, req.user.id, req.params.id]
    );

    await pool.query(
      `INSERT INTO complaint_party_b_engagements
        (complaint_id, type, author_id, author_role, comment)
       VALUES (?, 'tag', ?, 'regional_focal_point', ?)`,
      [
        req.params.id,
        req.user.id,
        comment?.trim() || `Regional focal point tagged Party B (${proposal.party_b_name || proposal.party_b_email}) for this complaint.`,
      ]
    );

    const updated = await getComplaintByIdRaw(req.params.id);
    return res.json({
      ...(await enrichComplaint(updated, req)),
      message: 'Party B tagged — they can now view this complaint and respond',
    });
  } catch (err) {
    console.error('Tag Party B error:', err.message);
    return res.status(500).json({ error: 'Failed to tag Party B' });
  }
}

async function pokePartyB(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (!canRfpEngagePartyB(complaint, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const pending = await getPendingPoke(req.params.id);
    if (pending) {
      return res.status(400).json({ error: 'Party B has a pending poke — wait for their response' });
    }

    const { comment } = req.body;

    const [result] = await pool.query(
      `INSERT INTO complaint_party_b_engagements
        (complaint_id, type, author_id, author_role, comment)
       VALUES (?, 'poke', ?, 'regional_focal_point', ?)`,
      [
        req.params.id,
        req.user.id,
        comment?.trim() || 'Please provide documents and updates for this regional complaint.',
      ]
    );

    const [rows] = await pool.query(
      `SELECT e.*, u.full_name AS author_name
       FROM complaint_party_b_engagements e
       JOIN users u ON u.id = e.author_id
       WHERE e.id = ?`,
      [result.insertId]
    );

    const [formatted] = await enrichEngagementList(rows);
    return res.status(201).json(formatted);
  } catch (err) {
    console.error('Poke Party B error:', err.message);
    return res.status(500).json({ error: 'Failed to poke Party B' });
  }
}

async function getPartyBEngagement(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (!canViewPartyBEngagement(req, complaint)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const rows = await getEngagementRows(req.params.id);
    const pendingPoke = await getPendingPoke(req.params.id);

    return res.json({
      complaint_id: Number(req.params.id),
      party_b_user_id: complaint.party_b_user_id,
      party_b_name: complaint.party_b_name || complaint.proposal_party_b_name,
      tagged_at: complaint.party_b_tagged_at,
      items: await enrichEngagementList(rows),
      pending_poke_id: pendingPoke?.id || null,
    });
  } catch (err) {
    console.error('Get Party B engagement error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch Party B engagement' });
  }
}

async function addPartyBEngagementComment(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const isRfp = canRfpEngagePartyB(complaint, req.user.id);
    const isPartyB = canPartyBEngage(complaint, req.user.id);

    if (!isRfp && !isPartyB) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { comment, document_url } = req.body;
    if (!comment?.trim() && !document_url && !req.file) {
      return res.status(400).json({ error: 'Comment or document is required' });
    }

    let docUrl = document_url || null;
    if (req.file) {
      docUrl = getPublicFileUrl(req, req.file.filename, 'complaints');
    }

    const [result] = await pool.query(
      `INSERT INTO complaint_party_b_engagements
        (complaint_id, type, author_id, author_role, comment, document_url)
       VALUES (?, 'comment', ?, ?, ?, ?)`,
      [
        req.params.id,
        req.user.id,
        req.user.role,
        comment?.trim() || null,
        docUrl,
      ]
    );

    const [rows] = await pool.query(
      `SELECT e.*, u.full_name AS author_name
       FROM complaint_party_b_engagements e
       JOIN users u ON u.id = e.author_id
       WHERE e.id = ?`,
      [result.insertId]
    );

    const [formatted] = await enrichEngagementList(rows);
    return res.status(201).json(formatted);
  } catch (err) {
    console.error('Party B engagement comment error:', err.message);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
}

async function respondToPartyBPoke(req, res) {
  try {
    if (req.user.role !== 'party_b') {
      return res.status(403).json({ error: 'Only Party B can respond to a poke' });
    }

    const complaint = await getComplaintByIdRaw(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (!canPartyBEngage(complaint, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const pendingPoke = await getPendingPoke(req.params.id);
    if (!pendingPoke) {
      return res.status(400).json({ error: 'No pending poke to respond to' });
    }

    const { activity_date, title, description, document_url, comment } = req.body;

    if (!activity_date || !title?.trim()) {
      return res.status(400).json({ error: 'activity_date and title are required' });
    }

    let docUrl = document_url || null;
    if (req.file) {
      docUrl = getPublicFileUrl(req, req.file.filename, 'complaints');
    }

    const [result] = await pool.query(
      `INSERT INTO complaint_party_b_engagements
        (complaint_id, type, author_id, author_role, comment, responds_to_id,
         response_date, response_title, response_description, response_document_url)
       VALUES (?, 'poke_response', ?, 'party_b', ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        req.user.id,
        comment?.trim() || null,
        pendingPoke.id,
        activity_date,
        title.trim(),
        description || null,
        docUrl,
      ]
    );

    const [rows] = await pool.query(
      `SELECT e.*, u.full_name AS author_name
       FROM complaint_party_b_engagements e
       JOIN users u ON u.id = e.author_id
       WHERE e.id = ?`,
      [result.insertId]
    );

    const [formatted] = await enrichEngagementList(rows);
    return res.status(201).json(formatted);
  } catch (err) {
    console.error('Party B poke response error:', err.message);
    return res.status(500).json({ error: 'Failed to submit poke response' });
  }
}

async function getPartyBAssignedComplaints(req, res) {
  try {
    const [rows] = await pool.query(
      `${COMPLAINT_SELECT}
       WHERE c.party_b_user_id = ?
         AND c.party_b_tagged_at IS NOT NULL
         AND c.status = 'forwarded'
       ORDER BY c.party_b_tagged_at DESC`,
      [req.user.id]
    );

    const enriched = await Promise.all(rows.map((row) => enrichComplaint(row, req)));
    return res.json(enriched);
  } catch (err) {
    console.error('Get Party B assigned complaints error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch assigned complaints' });
  }
}

async function uploadPartyBEngagementDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use document field' });
    }

    const fileUrl = getPublicFileUrl(req, req.file.filename, 'complaints');
    return res.json({ file_url: fileUrl });
  } catch (err) {
    console.error('Party B engagement upload error:', err.message);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
}

async function addComment(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    const access = checkComplaintAccess(req, complaint);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (['resolved', 'rejected'].includes(complaint.status)) {
      return res.status(400).json({ error: 'Cannot comment on a closed complaint' });
    }

    const { comment, visibility: requestedVisibility, document_url } = req.body;
    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'Comment is required' });
    }

    const visibility = resolveCommentVisibility(req, complaint, requestedVisibility);

    if (visibility === 'internal' && !canViewInternalTimeline(req.user.role)) {
      return res.status(403).json({ error: 'Cannot post internal comments' });
    }

    if (
      visibility === 'internal' &&
      req.user.role === 'sector_lead' &&
      !['forwarded', 'returned_to_sector_lead'].includes(complaint.status)
    ) {
      return res.status(400).json({
        error: 'Internal timeline is only available during regional review',
      });
    }

    let docUrl = document_url || null;
    if (req.file) {
      docUrl = getPublicFileUrl(req, req.file.filename, 'complaints');
    }

    const commentText = comment.trim();
    const [result] = await pool.query(
      `INSERT INTO complaint_comments
        (complaint_id, commented_by, commented_by_role, comment, visibility, document_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        req.user.id,
        req.user.role,
        commentText,
        visibility,
        docUrl,
      ]
    );

    const reviewerRoles = ['sector_lead', 'super_admin'];
    if (reviewerRoles.includes(req.user.role) && complaint.status === 'open') {
      await pool.query(
        `UPDATE complaints
         SET status = 'under_review', under_review_at = COALESCE(under_review_at, NOW())
         WHERE id = ? AND status = 'open'`,
        [req.params.id]
      );
      await pool.query(
        `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
         VALUES (?, ?, ?, 'under_review', ?)`,
        [req.params.id, req.user.id, req.user.role, commentText]
      );
    }

    const [rows] = await pool.query(
      `SELECT cc.*, u.full_name AS commented_by_name
       FROM complaint_comments cc
       JOIN users u ON u.id = cc.commented_by
       WHERE cc.id = ?`,
      [result.insertId]
    );

    const updated = await getComplaintByIdRaw(req.params.id);
    const recipients = [updated.filed_by_email, updated.tagged_sector_lead_email].filter(
      (email) => email && email !== req.user.email
    );
    notifyComplaintComment({
      complaint: updated,
      recipientEmails: recipients,
      authorName: req.user.full_name || req.user.email,
      comment: commentText,
    }).catch(() => {});

    return res.status(201).json({
      ...rows[0],
      complaint_status: updated.status,
      capabilities: buildComplaintCapabilities(req, updated),
    });
  } catch (err) {
    console.error('Add complaint comment error:', err.message);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
}

async function escalateComplaint(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    const access = checkEscalateAccess(req, complaint);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const reason = req.body?.comment ? String(req.body.comment).trim() : null;

    await pool.query(
      `UPDATE complaints
       SET status = 'escalated', escalated_at = NOW(), escalated_by = ?, awaiting_sector_lead = 0
       WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    await pool.query(
      `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'escalated', ?)`,
      [req.params.id, req.user.id, req.user.role, reason]
    );

    if (reason) {
      await pool.query(
        `INSERT INTO complaint_comments
          (complaint_id, commented_by, commented_by_role, comment, visibility)
         VALUES (?, ?, ?, ?, 'public')`,
        [req.params.id, req.user.id, req.user.role, reason]
      );
    }

    const updated = await getComplaintByIdRaw(req.params.id);
    const admins = await findSuperAdminUserIds();
    notifyComplaintEscalated({
      complaint: updated,
      superAdminEmails: admins.map((a) => a.email),
      filerEmail: updated.filed_by_email,
      sectorLeadEmail: updated.tagged_sector_lead_email,
    }).catch(() => {});

    return res.json(await enrichComplaint(updated, req));
  } catch (err) {
    console.error('Escalate complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to escalate complaint' });
  }
}

async function reopenComplaint(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    const access = checkReopenAccess(req, complaint);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const reason = req.body?.comment ? String(req.body.comment).trim() : null;
    if (!reason) {
      return res.status(400).json({ error: 'Comment is required when reopening a complaint' });
    }

    const dueAt = new Date(Date.now() + SLA_DAYS * 24 * 60 * 60 * 1000);
    const assignee = await getUserById(complaint.tagged_sector_lead);
    const awaitingSectorLead = assignee?.role === 'super_admin' ? 1 : 0;

    await pool.query(
      `UPDATE complaints
       SET status = 'open',
           resolution_comment = NULL,
           reopened_at = NOW(),
           under_review_at = NULL,
           due_at = ?,
           awaiting_sector_lead = ?
       WHERE id = ?`,
      [dueAt, awaitingSectorLead, req.params.id]
    );

    await pool.query(
      `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'reopened', ?)`,
      [req.params.id, req.user.id, req.user.role, reason]
    );

    await pool.query(
      `INSERT INTO complaint_comments
        (complaint_id, commented_by, commented_by_role, comment, visibility)
       VALUES (?, ?, ?, ?, 'public')`,
      [req.params.id, req.user.id, req.user.role, reason]
    );

    const updated = await getComplaintByIdRaw(req.params.id);
    notifyComplaintStatusChange({
      complaint: updated,
      filerEmail: updated.filed_by_email,
      sectorLeadEmail: updated.tagged_sector_lead_email,
      outcomeLabel: 'reopened',
      comment: reason,
    }).catch(() => {});

    return res.json(await enrichComplaint(updated, req));
  } catch (err) {
    console.error('Reopen complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to reopen complaint' });
  }
}

async function getComplaintStats(req, res) {
  try {
    const [[counts]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'open') AS open_count,
         SUM(status = 'under_review') AS under_review_count,
         SUM(status = 'escalated') AS escalated_count,
         SUM(status = 'resolved') AS resolved_count,
         SUM(status = 'rejected') AS rejected_count,
         SUM(awaiting_sector_lead = 1 AND status IN ('open','under_review','escalated')) AS awaiting_sector_lead_count,
         SUM(
           due_at IS NOT NULL
           AND due_at < NOW()
           AND status IN ('open','under_review','escalated')
         ) AS overdue_count
       FROM complaints`
    );

    return res.json({
      total: Number(counts.total) || 0,
      open: Number(counts.open_count) || 0,
      under_review: Number(counts.under_review_count) || 0,
      escalated: Number(counts.escalated_count) || 0,
      resolved: Number(counts.resolved_count) || 0,
      rejected: Number(counts.rejected_count) || 0,
      awaiting_sector_lead: Number(counts.awaiting_sector_lead_count) || 0,
      overdue: Number(counts.overdue_count) || 0,
      sla_days: SLA_DAYS,
    });
  } catch (err) {
    console.error('Get complaint stats error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch complaint stats' });
  }
}

module.exports = {
  createComplaint,
  uploadDocument,
  getMyComplaints,
  getSectorComplaints,
  getForwardedComplaints,
  getPartyBAssignedComplaints,
  getAllComplaints,
  getComplaintFilterOptions,
  getComplaintStats,
  getComplaintById,
  approveComplaint,
  rejectComplaint,
  escalateComplaint,
  reopenComplaint,
  forwardComplaint,
  returnToSectorLead,
  tagPartyB,
  pokePartyB,
  getPartyBEngagement,
  addPartyBEngagementComment,
  respondToPartyBPoke,
  uploadPartyBEngagementDocument,
  addComment,
};

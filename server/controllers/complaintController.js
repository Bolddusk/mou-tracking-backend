const pool = require('../config/db');
const { getPublicFileUrl } = require('../middleware/upload');
const {
  checkComplaintAccess,
  checkComplaintReviewAccess,
  checkRfpReviewAccess,
  canViewInternalTimeline,
  resolveCommentVisibility,
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

const COMPLAINT_SELECT = `
  SELECT c.*,
    p.proposal_title,
    p.sector AS proposal_sector,
    p.party_b_name AS proposal_party_b_name,
    pa.full_name AS filed_by_name,
    pa.email AS filed_by_email,
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
    'SELECT id, party_a_id, party_b_user_id, proposal_title, sector FROM proposals WHERE id = ?',
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
    ...complaint,
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
    const taggedSectorLead = Number(req.body.tagged_sector_lead);
    const { title, description, document_url } = req.body;

    if (!proposalId || !taggedSectorLead || !title?.trim() || !description?.trim()) {
      return res.status(400).json({
        error: 'proposal_id, tagged_sector_lead, title, and description are required',
      });
    }

    const proposal = await getProposalForComplaintFiler(proposalId, req.user);
    if (!proposal) {
      return res.status(403).json({ error: 'Proposal not found or access denied' });
    }

    const sectorLead = await getUserById(taggedSectorLead);
    if (!sectorLead || sectorLead.role !== 'sector_lead') {
      return res.status(400).json({ error: 'tagged_sector_lead must be a valid sector lead' });
    }

    let docUrl = document_url || null;
    if (req.file) {
      docUrl = getPublicFileUrl(req, req.file.filename, 'complaints');
    }

    const [result] = await pool.query(
      `INSERT INTO complaints
        (proposal_id, filed_by, tagged_sector_lead, title, description, document_url, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [
        proposalId,
        req.user.id,
        taggedSectorLead,
        title.trim(),
        description.trim(),
        docUrl,
      ]
    );

    const complaint = await getComplaintByIdRaw(result.insertId);
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
    return res.json(rows);
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
    return res.json(rows);
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
    const [rows] = await pool.query(`${COMPLAINT_SELECT} ORDER BY c.created_at DESC`);
    return res.json(rows);
  } catch (err) {
    console.error('Get all complaints error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch complaints' });
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

    await pool.query(`UPDATE complaints SET status = 'resolved' WHERE id = ?`, [req.params.id]);

    await pool.query(
      `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'approved', ?)`,
      [req.params.id, req.user.id, req.user.role, comment?.trim() || null]
    );

    if (comment?.trim()) {
      const visibility = resolveCommentVisibility(req, complaint, 'public');
      await pool.query(
        `INSERT INTO complaint_comments
          (complaint_id, commented_by, commented_by_role, comment, visibility)
         VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, req.user.id, req.user.role, comment.trim(), visibility]
      );
    }

    const updated = await getComplaintByIdRaw(req.params.id);
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

    await pool.query(`UPDATE complaints SET status = 'rejected' WHERE id = ?`, [req.params.id]);

    await pool.query(
      `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'rejected', ?)`,
      [req.params.id, req.user.id, req.user.role, comment.trim()]
    );

    const visibility = resolveCommentVisibility(req, complaint, 'public');
    await pool.query(
      `INSERT INTO complaint_comments
        (complaint_id, commented_by, commented_by_role, comment, visibility)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, req.user.role, comment.trim(), visibility]
    );

    const updated = await getComplaintByIdRaw(req.params.id);
    return res.json(await enrichComplaint(updated, req));
  } catch (err) {
    console.error('Reject complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to reject complaint' });
  }
}

async function forwardComplaint(req, res) {
  try {
    if (req.user.role !== 'sector_lead') {
      return res.status(403).json({ error: 'Only sector leads can forward complaints' });
    }

    const complaint = await getComplaintByIdRaw(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (complaint.tagged_sector_lead !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const allowedForward = ['open', 'under_review', 'returned_to_sector_lead'];
    if (!allowedForward.includes(complaint.status)) {
      return res.status(400).json({ error: 'Complaint cannot be forwarded in its current status' });
    }

    const regionalFocalPointId = Number(req.body.regional_focal_point_id);
    const { comment } = req.body;

    if (!regionalFocalPointId) {
      return res.status(400).json({ error: 'regional_focal_point_id is required' });
    }

    const rfp = await getUserById(regionalFocalPointId);
    if (!rfp || rfp.role !== 'regional_focal_point') {
      return res.status(400).json({
        error: 'regional_focal_point_id must be a valid regional focal point',
      });
    }

    await pool.query(
      `UPDATE complaints
       SET status = 'forwarded',
           forwarded_to = ?,
           forwarded_at = NOW(),
           returned_at = NULL,
           returned_by = NULL
       WHERE id = ?`,
      [regionalFocalPointId, req.params.id]
    );

    await pool.query(
      `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'forwarded', ?)`,
      [req.params.id, req.user.id, req.user.role, comment?.trim() || null]
    );

    if (comment?.trim()) {
      await pool.query(
        `INSERT INTO complaint_comments
          (complaint_id, commented_by, commented_by_role, comment, visibility)
         VALUES (?, ?, ?, ?, 'internal')`,
        [req.params.id, req.user.id, req.user.role, comment.trim()]
      );
    }

    const updated = await getComplaintByIdRaw(req.params.id);
    return res.json(await enrichComplaint(updated, req));
  } catch (err) {
    console.error('Forward complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to forward complaint' });
  }
}

async function returnToSectorLead(req, res) {
  try {
    const complaint = await getComplaintByIdRaw(req.params.id);
    const access = checkRfpReviewAccess(req, complaint);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!complaint.party_b_tagged_at) {
      return res.status(400).json({
        error: 'Tag Party B and complete engagement before returning to sector lead',
      });
    }

    const { comment } = req.body;
    const partyBDocs = await getPartyBDocumentsFromEngagement(req.params.id);

    await pool.query(
      `UPDATE complaints
       SET status = 'returned_to_sector_lead',
           returned_at = NOW(),
           returned_by = ?
       WHERE id = ?`,
      [req.user.id, req.params.id]
    );

    await pool.query(
      `INSERT INTO complaint_actions (complaint_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'returned', ?)`,
      [req.params.id, req.user.id, req.user.role, comment?.trim() || null]
    );

    const returnNote =
      comment?.trim() ||
      'Returned to sector lead with Party B documents from regional engagement.';

    await pool.query(
      `INSERT INTO complaint_comments
        (complaint_id, commented_by, commented_by_role, comment, visibility)
       VALUES (?, ?, ?, ?, 'internal')`,
      [req.params.id, req.user.id, req.user.role, returnNote]
    );

    for (const doc of partyBDocs) {
      const docComment = [
        `[Party B document — ${doc.author_name}]`,
        doc.title ? `Title: ${doc.title}` : null,
        doc.comment || doc.description || null,
      ]
        .filter(Boolean)
        .join('\n');

      await pool.query(
        `INSERT INTO complaint_comments
          (complaint_id, commented_by, commented_by_role, comment, visibility, document_url)
         VALUES (?, ?, ?, ?, 'internal', ?)`,
        [
          req.params.id,
          req.user.id,
          req.user.role,
          docComment,
          doc.document_url,
        ]
      );
    }

    const updated = await getComplaintByIdRaw(req.params.id);
    const enriched = await enrichComplaint(updated, req);
    return res.json({
      ...enriched,
      party_b_documents_forwarded: partyBDocs,
      message: 'Complaint returned to sector lead with Party B documents',
    });
  } catch (err) {
    console.error('Return complaint error:', err.message);
    return res.status(500).json({ error: 'Failed to return complaint to sector lead' });
  }
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

    const [result] = await pool.query(
      `INSERT INTO complaint_comments
        (complaint_id, commented_by, commented_by_role, comment, visibility, document_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        req.user.id,
        req.user.role,
        comment.trim(),
        visibility,
        docUrl,
      ]
    );

    const [rows] = await pool.query(
      `SELECT cc.*, u.full_name AS commented_by_name
       FROM complaint_comments cc
       JOIN users u ON u.id = cc.commented_by
       WHERE cc.id = ?`,
      [result.insertId]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Add complaint comment error:', err.message);
    return res.status(500).json({ error: 'Failed to add comment' });
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
  getComplaintById,
  approveComplaint,
  rejectComplaint,
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

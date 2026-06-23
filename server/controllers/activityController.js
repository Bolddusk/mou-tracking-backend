const pool = require('../config/db');
const { checkProposalAccess } = require('../utils/proposalAccess');
const { getPublicFileUrl } = require('../middleware/upload');
const { isProposalLocked, PROPOSAL_LOCKED_ERROR } = require('../utils/dealClose');

const PROPOSAL_SELECT = `
  SELECT p.*, pa.full_name AS party_a_name
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
`;

const POKE_TITLE = 'Update Requested';
const ACTIVITY_ROLES = ['party_a', 'sector_lead', 'super_admin'];
const REVIEWER_ROLES = ['sector_lead', 'super_admin'];

const ACTIVITY_SELECT = `
  SELECT a.*,
    u.full_name AS added_by_name,
    ru.full_name AS response_by_name
  FROM proposal_activities a
  JOIN users u ON u.id = a.added_by
  LEFT JOIN users ru ON ru.id = a.response_by
`;

async function getProposalById(proposalId) {
  const [rows] = await pool.query(`${PROPOSAL_SELECT} WHERE p.id = ?`, [proposalId]);
  return rows[0] || null;
}

async function getActivityById(activityId) {
  const [rows] = await pool.query(
    `SELECT a.*, p.sector, p.party_a_id, p.status AS proposal_status
     FROM proposal_activities a
     JOIN proposals p ON p.id = a.proposal_id
     WHERE a.id = ?`,
    [activityId]
  );
  return rows[0] || null;
}

async function enrichActivities(activities) {
  if (!activities.length) return [];

  const ids = activities.map((a) => a.id);

  const [comments] = await pool.query(
    `SELECT c.*, u.full_name AS commented_by_name
     FROM activity_comments c
     JOIN users u ON u.id = c.commented_by
     WHERE c.activity_id IN (?)
     ORDER BY c.created_at ASC`,
    [ids]
  );

  const [approvals] = await pool.query(
    `SELECT ap.*, u.full_name AS action_by_name
     FROM activity_approvals ap
     JOIN users u ON u.id = ap.action_by
     WHERE ap.activity_id IN (?)
     ORDER BY ap.actioned_at ASC`,
    [ids]
  );

  return activities.map((activity) => {
    const isPoke = activity.title === POKE_TITLE;
    const pokeResponse = activity.response_submitted_at
      ? {
          work_date: activity.response_date
            ? new Date(activity.response_date).toISOString().slice(0, 10)
            : activity.response_date,
          title: activity.response_title,
          description: activity.response_description,
          support_file_url: activity.response_support_file_url,
          submitted_at: activity.response_submitted_at,
          submitted_by_name: activity.response_by_name,
        }
      : null;

    return {
      ...activity,
      activity_date: activity.activity_date
        ? new Date(activity.activity_date).toISOString().slice(0, 10)
        : activity.activity_date,
      is_poke: isPoke,
      can_respond: isPoke && !activity.response_submitted_at,
      poke_response: pokeResponse,
      comments: comments.filter((c) => c.activity_id === activity.id),
      approvals: approvals.filter((a) => a.activity_id === activity.id),
    };
  });
}

async function getActivityWithRelations(activityId) {
  const [rows] = await pool.query(`${ACTIVITY_SELECT} WHERE a.id = ?`, [activityId]);
  if (!rows.length) return null;
  const [enriched] = await enrichActivities(rows);
  return enriched;
}

async function createActivity(req, res) {
  try {
    if (req.user.role === 'regional_focal_point') {
      return res.status(403).json({
        error: 'Regional Focal Point has read-only access to activities',
      });
    }

    const proposalId = req.params.proposalId;
    const proposal = await getProposalById(proposalId);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (isProposalLocked(proposal)) {
      return res.status(400).json({ error: PROPOSAL_LOCKED_ERROR });
    }

    const { activity_date, title, description, support_file_url, comment } = req.body;

    if (!activity_date || !title?.trim()) {
      return res.status(400).json({ error: 'activity_date and title are required' });
    }

    const [result] = await pool.query(
      `INSERT INTO proposal_activities
        (proposal_id, added_by, added_by_role, activity_date, title, description, support_file_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        proposalId,
        req.user.id,
        req.user.role,
        activity_date,
        title.trim(),
        description || null,
        support_file_url || null,
      ]
    );

    const activityId = result.insertId;

    if (comment && String(comment).trim()) {
      await pool.query(
        `INSERT INTO activity_comments (activity_id, commented_by, commented_by_role, comment)
         VALUES (?, ?, ?, ?)`,
        [activityId, req.user.id, req.user.role, comment.trim()]
      );
    }

    const activity = await getActivityWithRelations(activityId);
    return res.status(201).json(activity);
  } catch (err) {
    console.error('Create activity error:', err.message);
    return res.status(500).json({ error: 'Failed to create activity' });
  }
}

async function getProposalActivities(req, res) {
  try {
    const proposalId = req.params.proposalId;
    const proposal = await getProposalById(proposalId);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const [rows] = await pool.query(
      `${ACTIVITY_SELECT} WHERE a.proposal_id = ?
       ORDER BY a.activity_date ASC, a.created_at ASC`,
      [proposalId]
    );

    const activities = await enrichActivities(rows);
    return res.json({ activities });
  } catch (err) {
    console.error('Get activities error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }
}

async function pokeForUpdate(req, res) {
  try {
    if (!REVIEWER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const proposalId = req.params.proposalId;
    const proposal = await getProposalById(proposalId);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [result] = await pool.query(
      `INSERT INTO proposal_activities
        (proposal_id, added_by, added_by_role, activity_date, title, description, status)
       VALUES (?, ?, ?, ?, 'Update Requested', 'Please provide latest update on this proposal', 'pending')`,
      [proposalId, req.user.id, req.user.role, today]
    );

    const activity = await getActivityWithRelations(result.insertId);
    return res.status(201).json(activity);
  } catch (err) {
    console.error('Poke error:', err.message);
    return res.status(500).json({ error: 'Failed to send update request' });
  }
}

async function verifyActivityReviewAccess(req, activity) {
  if (!activity) return { error: 'Activity not found', status: 404 };
  if (!REVIEWER_ROLES.includes(req.user.role)) {
    return { error: 'Access denied', status: 403 };
  }
  if (activity.status !== 'pending') {
    return { error: 'Only pending activities can be reviewed', status: 400 };
  }

  const proposal = await getProposalById(activity.proposal_id);
  const access = await checkProposalAccess(req, proposal);
  if (!access.ok) {
    return { error: access.error, status: access.status };
  }

  return { ok: true, activity, proposal };
}

async function approveActivity(req, res) {
  try {
    const activity = await getActivityById(req.params.activityId);
    const check = await verifyActivityReviewAccess(req, activity);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    const { comment } = req.body;

    await pool.query(`UPDATE proposal_activities SET status = 'approved' WHERE id = ?`, [
      req.params.activityId,
    ]);

    await pool.query(
      `INSERT INTO activity_approvals (activity_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'approved', ?)`,
      [req.params.activityId, req.user.id, req.user.role, comment || null]
    );

    const updated = await getActivityWithRelations(req.params.activityId);
    return res.json(updated);
  } catch (err) {
    console.error('Approve activity error:', err.message);
    return res.status(500).json({ error: 'Failed to approve activity' });
  }
}

async function rejectActivity(req, res) {
  try {
    const { comment } = req.body;

    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'Comment is required when rejecting' });
    }

    const activity = await getActivityById(req.params.activityId);
    const check = await verifyActivityReviewAccess(req, activity);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    await pool.query(`UPDATE proposal_activities SET status = 'rejected' WHERE id = ?`, [
      req.params.activityId,
    ]);

    await pool.query(
      `INSERT INTO activity_approvals (activity_id, action_by, action_by_role, action, comment)
       VALUES (?, ?, ?, 'rejected', ?)`,
      [req.params.activityId, req.user.id, req.user.role, comment.trim()]
    );

    const updated = await getActivityWithRelations(req.params.activityId);
    return res.json(updated);
  } catch (err) {
    console.error('Reject activity error:', err.message);
    return res.status(500).json({ error: 'Failed to reject activity' });
  }
}

async function verifyActivityAccess(req, activity) {
  if (!activity) return { error: 'Activity not found', status: 404 };

  const proposal = await getProposalById(activity.proposal_id);
  const access = await checkProposalAccess(req, proposal);
  if (!access.ok) {
    return { error: access.error, status: access.status };
  }

  return { ok: true, activity };
}

async function addComment(req, res) {
  try {
    const activity = await getActivityById(req.params.activityId);
    const check = await verifyActivityAccess(req, activity);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    const { comment } = req.body;
    if (!comment || !String(comment).trim()) {
      return res.status(400).json({ error: 'Comment is required' });
    }

    const [result] = await pool.query(
      `INSERT INTO activity_comments (activity_id, commented_by, commented_by_role, comment)
       VALUES (?, ?, ?, ?)`,
      [req.params.activityId, req.user.id, req.user.role, comment.trim()]
    );

    const [rows] = await pool.query(
      `SELECT c.*, u.full_name AS commented_by_name
       FROM activity_comments c
       JOIN users u ON u.id = c.commented_by
       WHERE c.id = ?`,
      [result.insertId]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Add comment error:', err.message);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
}

async function getComments(req, res) {
  try {
    const activity = await getActivityById(req.params.activityId);
    const check = await verifyActivityAccess(req, activity);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    const [rows] = await pool.query(
      `SELECT c.*, u.full_name AS commented_by_name
       FROM activity_comments c
       JOIN users u ON u.id = c.commented_by
       WHERE c.activity_id = ?
       ORDER BY c.created_at ASC`,
      [req.params.activityId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('Get comments error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }
}

async function respondToPoke(req, res) {
  try {
    if (req.user.role !== 'party_a') {
      return res.status(403).json({ error: 'Only Party A can respond to a poke' });
    }

    const activity = await getActivityById(req.params.activityId);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    if (activity.title !== POKE_TITLE) {
      return res.status(400).json({ error: 'This activity is not a poke request' });
    }

    if (activity.response_submitted_at) {
      return res.status(400).json({ error: 'This poke has already been answered' });
    }

    const proposal = await getProposalById(activity.proposal_id);
    if (!proposal || proposal.party_a_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { activity_date, title, description, support_file_url, comment } = req.body;

    if (!activity_date || !title?.trim()) {
      return res.status(400).json({ error: 'activity_date and title are required' });
    }

    await pool.query(
      `UPDATE proposal_activities SET
        response_date = ?,
        response_title = ?,
        response_description = ?,
        response_support_file_url = ?,
        response_submitted_at = NOW(),
        response_by = ?
       WHERE id = ?`,
      [
        activity_date,
        title.trim(),
        description || null,
        support_file_url || null,
        req.user.id,
        req.params.activityId,
      ]
    );

    if (comment && String(comment).trim()) {
      await pool.query(
        `INSERT INTO activity_comments (activity_id, commented_by, commented_by_role, comment)
         VALUES (?, ?, ?, ?)`,
        [req.params.activityId, req.user.id, req.user.role, comment.trim()]
      );
    }

    const updated = await getActivityWithRelations(req.params.activityId);
    return res.json(updated);
  } catch (err) {
    console.error('Respond to poke error:', err.message);
    return res.status(500).json({ error: 'Failed to submit poke response' });
  }
}

async function uploadSupportFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use support_file field' });
    }

    const file_url = getPublicFileUrl(req, req.file.filename);
    return res.json({ file_url });
  } catch (err) {
    console.error('Activity file upload error:', err.message);
    return res.status(500).json({ error: 'File upload failed' });
  }
}

module.exports = {
  createActivity,
  getProposalActivities,
  pokeForUpdate,
  respondToPoke,
  approveActivity,
  rejectActivity,
  addComment,
  getComments,
  uploadSupportFile,
};

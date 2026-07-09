const pool = require('../config/db');
const { checkProposalAccess } = require('../utils/proposalAccess');
const { getPublicFileUrl } = require('../middleware/upload');
const { isProposalLocked, PROPOSAL_LOCKED_ERROR } = require('../utils/dealClose');
const {
  POKE_TITLE,
  PROGRESS_RECORDED_STATUS,
  PROGRESS_SHEET_COLUMNS,
  mapActivityToProgress,
  resolveProgressCapabilities,
  isAdminRole,
  filterProgressTabActivities,
  syncProgressEntryToProposal,
  syncManualProgressToProposal,
  normalizeProgressDescriptionInput,
  normalizeProgressActivityDateInput,
} = require('../utils/progressActivity');
const {
  progressRowsToCsv,
  progressRowsToXlsx,
} = require('../utils/progressSheetExport');
const {
  assertCanCreatePoke,
  buildPokeWorkflowCapabilities,
  derivePokeWorkflowStatus,
  dismissUpdateRequest,
  dismissAllPendingUpdateRequests,
  formatPokeResponsePayload,
  getLatestOpenPoke,
  REVIEWER_ROLES,
} = require('../utils/pokeWorkflow');
const { attachPokeStatus } = require('../utils/pokeStatus');

const PROPOSAL_SELECT = `
  SELECT p.*, pa.full_name AS party_a_name, pa.email AS party_a_user_email
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
`;

const POKE_TITLE_LEGACY = POKE_TITLE;
const ACTIVITY_ROLES = ['party_a', 'sector_lead', 'super_admin', 'admin'];
const REVIEWER_ROLES_LEGACY = ['sector_lead', 'super_admin'];

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
    const isPoke = activity.title === POKE_TITLE_LEGACY;
    const pokeResponse = activity.response_submitted_at
      ? formatPokeResponsePayload(activity)
      : null;
    const pokeWorkflowStatus = isPoke ? derivePokeWorkflowStatus(activity) : null;

    return {
      ...activity,
      activity_date: activity.activity_date
        ? new Date(activity.activity_date).toISOString().slice(0, 10)
        : activity.activity_date,
      progress_date: activity.activity_date
        ? new Date(activity.activity_date).toISOString().slice(0, 10)
        : activity.activity_date,
      source: activity.source || 'manual',
      synced_fields: parseSyncedFields(activity.synced_fields),
      is_poke: isPoke,
      poke_workflow_status: pokeWorkflowStatus,
      can_respond: isPoke && pokeWorkflowStatus === 'pending_response',
      can_edit_poke_response: isPoke && pokeWorkflowStatus === 'awaiting_review',
      can_promote_to_progress: isPoke && pokeWorkflowStatus === 'awaiting_review',
      approval_required: false,
      can_approve: false,
      can_reject: false,
      poke_response: pokeResponse,
      comments: comments.filter((c) => c.activity_id === activity.id),
      approvals: approvals.filter((a) => a.activity_id === activity.id),
    };
  });
}

function parseSyncedFields(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildProgressListPayload(activities, user) {
  const visibleActivities = filterProgressTabActivities(activities);
  const progressUpdates = visibleActivities.map((activity) => mapActivityToProgress(activity, user));
  const progressRows = progressUpdates.map((item) => item.sheet_row);

  return {
    progress_updates: progressUpdates,
    activities: progressUpdates,
    approval_required: false,
    sheet_columns: PROGRESS_SHEET_COLUMNS,
    progress_rows: progressRows,
    count: progressUpdates.length,
    pending_count: progressUpdates.filter((item) => item.raw_status === 'pending').length,
    locked_count: progressUpdates.filter((item) => item.edit_locked).length,
  };
}

async function verifyProgressMutateAccess(req, activity, { allowLockedForAdmin = false } = {}) {
  if (!activity) return { error: 'Progress entry not found', status: 404 };
  if (activity.title === POKE_TITLE_LEGACY) {
    return { error: 'Poke requests cannot be edited this way', status: 400 };
  }

  const proposal = await getProposalById(activity.proposal_id);
  const access = await checkProposalAccess(req, proposal);
  if (!access.ok) {
    return { error: access.error, status: access.status };
  }

  if (isProposalLocked(proposal)) {
    return { error: PROPOSAL_LOCKED_ERROR, status: 400 };
  }

  const caps = resolveProgressCapabilities(activity, req.user);
  if (!caps.can_edit && !allowLockedForAdmin) {
    if (activity.edit_locked && req.user.role === 'sector_lead') {
      return {
        error: 'This progress entry is locked after Super Admin comment. Request edit approval first.',
        status: 403,
      };
    }
    return { error: 'You cannot edit this progress entry', status: 403 };
  }

  return { ok: true, activity, proposal, capabilities: caps };
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

    const activity_date = normalizeProgressActivityDateInput(req.body);
    const title = req.body.title;
    const description = normalizeProgressDescriptionInput(req.body);
    const { support_file_url, comment } = req.body;

    if (!activity_date || !title?.trim()) {
      return res.status(400).json({ error: 'activity_date and title are required' });
    }

    if (!description) {
      return res.status(400).json({
        error: 'description is required (send as description or what_was_done)',
      });
    }

    const [result] = await pool.query(
      `INSERT INTO proposal_activities
        (proposal_id, added_by, added_by_role, activity_date, title, description, support_file_url, status, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [
        proposalId,
        req.user.id,
        req.user.role,
        activity_date,
        title.trim(),
        description,
        support_file_url || null,
        PROGRESS_RECORDED_STATUS,
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
    const mouSync = await syncManualProgressToProposal(proposal, {
      description,
      activityDate: activity_date,
      createdAt: activity.created_at,
    });

    const payload = mapActivityToProgress(activity, req.user);
    if (mouSync) {
      payload.mou_fields_synced = mouSync.applied_fields;
      payload.mou_fields = mouSync.mou_fields;
    }
    return res.status(201).json(payload);
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
    return res.json(buildProgressListPayload(activities, req.user));
  } catch (err) {
    console.error('Get activities error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }
}

async function pokeForUpdate(req, res) {
  try {
    if (!REVIEWER_ROLES_LEGACY.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const proposalId = req.params.proposalId;
    const proposal = await getProposalById(proposalId);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const pokeCheck = await assertCanCreatePoke(proposal);
    if (!pokeCheck.ok) {
      return res.status(pokeCheck.status).json({
        error: pokeCheck.error,
        code: pokeCheck.code || undefined,
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    const [result] = await pool.query(
      `INSERT INTO proposal_activities
        (proposal_id, added_by, added_by_role, activity_date, title, description, status)
       VALUES (?, ?, ?, ?, ?, 'Please provide latest update on this MOU', 'pending')`,
      [proposalId, req.user.id, req.user.role, today, POKE_TITLE_LEGACY]
    );

    const activity = await getActivityWithRelations(result.insertId);
    const [withPoke] = await attachPokeStatus([proposal]);
    return res.status(201).json({
      ...activity,
      poke_status: withPoke.poke_status,
      update_request: buildPokeWorkflowCapabilities(req, proposal, activity),
    });
  } catch (err) {
    console.error('Poke error:', err.message);
    return res.status(500).json({ error: 'Failed to send update request' });
  }
}

async function exportProposalProgress(req, res) {
  try {
    const proposalId = req.params.proposalId || req.params.id;
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
    const progressRows = buildProgressListPayload(activities, req.user).progress_rows;
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const title =
      proposal.venture_name || proposal.company_name || proposal.proposal_title || `MOU-${proposalId}`;

    if (format === 'csv') {
      const body = progressRowsToCsv(progressRows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="mou-${proposalId}-progress.csv"`
      );
      return res.send(body);
    }

    if (format === 'xlsx' || format === 'xls') {
      const body = await progressRowsToXlsx(progressRows, title);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="mou-${proposalId}-progress.xlsx"`
      );
      return res.send(body);
    }

    return res.status(400).json({ error: 'Invalid format. Use xlsx, xls, or csv' });
  } catch (err) {
    console.error('Export proposal progress error:', err.message);
    return res.status(500).json({ error: 'Failed to export progress sheet' });
  }
}

async function updateProgressEntry(req, res) {
  try {
    const activity = await getActivityById(req.params.activityId);
    const check = await verifyProgressMutateAccess(req, activity);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    const { activity_date, title, description, support_file_url, mou_field_values, sync_to_mou_fields } =
      req.body;
    const normalizedDescription =
      description !== undefined ? normalizeProgressDescriptionInput(req.body) : undefined;
    const normalizedActivityDate =
      activity_date !== undefined ? normalizeProgressActivityDateInput(req.body) : undefined;
    const updates = [];
    const values = [];

    if (activity_date !== undefined) {
      updates.push('activity_date = ?');
      values.push(normalizedActivityDate);
    }
    if (title !== undefined) {
      const nextTitle = String(title).trim();
      if (!nextTitle) {
        return res.status(400).json({ error: 'title cannot be empty' });
      }
      updates.push('title = ?');
      values.push(nextTitle);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(normalizedDescription || null);
    }
    if (support_file_url !== undefined) {
      updates.push('support_file_url = ?');
      values.push(support_file_url || null);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No progress fields provided to update' });
    }

    values.push(req.params.activityId);
    await pool.query(`UPDATE proposal_activities SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = await getActivityWithRelations(req.params.activityId);
    const proposal = check.proposal || (await getProposalById(activity.proposal_id));
    let mouSync = await syncProgressEntryToProposal(proposal, activity, {
      description: normalizedDescription,
      mou_field_values,
      sync_to_mou_fields,
    });

    if (!mouSync && activity.source === 'manual' && normalizedDescription !== undefined) {
      mouSync = await syncManualProgressToProposal(proposal, {
        description: normalizedDescription,
        activityDate: normalizedActivityDate ?? updated.activity_date,
        createdAt: updated.created_at,
      });
    }

    return res.json({
      ...mapActivityToProgress(updated, req.user),
      mou_sync: mouSync,
    });
  } catch (err) {
    console.error('Update progress entry error:', err.message);
    return res.status(500).json({ error: 'Failed to update progress entry' });
  }
}

async function deleteProgressEntry(req, res) {
  try {
    const activity = await getActivityById(req.params.activityId);
    if (!activity) {
      return res.status(404).json({ error: 'Progress entry not found' });
    }

    const proposal = await getProposalById(activity.proposal_id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (isProposalLocked(proposal)) {
      return res.status(400).json({ error: PROPOSAL_LOCKED_ERROR });
    }

    const caps = resolveProgressCapabilities(activity, req.user);
    if (!caps.can_delete) {
      return res.status(403).json({ error: 'You cannot delete this progress entry' });
    }

    await pool.query('DELETE FROM activity_comments WHERE activity_id = ?', [req.params.activityId]);
    await pool.query('DELETE FROM activity_approvals WHERE activity_id = ?', [req.params.activityId]);
    await pool.query('DELETE FROM proposal_activities WHERE id = ?', [req.params.activityId]);

    return res.json({ message: 'Progress entry deleted successfully', id: Number(req.params.activityId) });
  } catch (err) {
    console.error('Delete progress entry error:', err.message);
    return res.status(500).json({ error: 'Failed to delete progress entry' });
  }
}

async function requestProgressEditUnlock(req, res) {
  try {
    const activity = await getActivityById(req.params.activityId);
    if (!activity) {
      return res.status(404).json({ error: 'Progress entry not found' });
    }

    const caps = resolveProgressCapabilities(activity, req.user);
    if (!caps.can_request_unlock) {
      return res.status(400).json({ error: 'Edit unlock cannot be requested for this entry' });
    }

    const note = req.body?.note ? String(req.body.note).trim() : null;

    await pool.query(
      `UPDATE proposal_activities
       SET edit_unlock_requested_at = NOW(),
           edit_unlock_requested_by = ?,
           edit_unlock_request_note = ?
       WHERE id = ?`,
      [req.user.id, note, req.params.activityId]
    );

    const updated = await getActivityWithRelations(req.params.activityId);
    return res.json(mapActivityToProgress(updated, req.user));
  } catch (err) {
    console.error('Request progress edit unlock error:', err.message);
    return res.status(500).json({ error: 'Failed to request edit unlock' });
  }
}

async function grantProgressEditUnlock(req, res) {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Only admin can grant edit unlock' });
    }

    const activity = await getActivityById(req.params.activityId);
    if (!activity) {
      return res.status(404).json({ error: 'Progress entry not found' });
    }

    const caps = resolveProgressCapabilities(activity, req.user);
    if (!caps.can_grant_unlock) {
      return res.status(400).json({ error: 'No pending edit unlock request for this entry' });
    }

    await pool.query(
      `UPDATE proposal_activities
       SET edit_locked = 0,
           edit_unlock_requested_at = NULL,
           edit_unlock_requested_by = NULL,
           edit_unlock_request_note = NULL
       WHERE id = ?`,
      [req.params.activityId]
    );

    const updated = await getActivityWithRelations(req.params.activityId);
    return res.json(mapActivityToProgress(updated, req.user));
  } catch (err) {
    console.error('Grant progress edit unlock error:', err.message);
    return res.status(500).json({ error: 'Failed to grant edit unlock' });
  }
}

async function approveActivity(req, res) {
  return res.status(400).json({
    error: 'Progress updates no longer require approval',
  });
}

async function rejectActivity(req, res) {
  return res.status(400).json({
    error: 'Progress updates no longer require approval',
  });
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

    if (
      isAdminRole(req.user.role) &&
      activity.added_by_role === 'sector_lead' &&
      Number(activity.added_by) !== Number(req.user.id)
    ) {
      await pool.query(
        `UPDATE proposal_activities
         SET edit_locked = 1,
             edit_unlock_requested_at = NULL,
             edit_unlock_requested_by = NULL,
             edit_unlock_request_note = NULL
         WHERE id = ?`,
        [req.params.activityId]
      );
    }

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

async function getProgressEntry(req, res) {
  try {
    const activity = await getActivityWithRelations(req.params.activityId);
    if (!activity) {
      return res.status(404).json({ error: 'Progress entry not found' });
    }

    const check = await verifyActivityAccess(req, activity);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    return res.json(mapActivityToProgress(activity, req.user));
  } catch (err) {
    console.error('Get progress entry error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch progress entry' });
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

async function verifyPokeReviewAccess(req, activity) {
  if (!activity) return { error: 'Update request not found', status: 404 };
  if (activity.title !== POKE_TITLE_LEGACY) {
    return { error: 'This activity is not an update request', status: 400 };
  }
  if (activity.poke_dismissed_at) {
    return { error: 'This update request was dismissed', status: 400 };
  }
  if (activity.response_promoted_at) {
    return { error: 'This update was already moved to Progress', status: 400 };
  }

  const proposal = await getProposalById(activity.proposal_id);
  const access = await checkProposalAccess(req, proposal);
  if (!access.ok) {
    return { error: access.error, status: access.status };
  }

  if (!REVIEWER_ROLES.has(req.user.role)) {
    return { error: 'Only Sector Lead or Super Admin can review update requests', status: 403 };
  }

  return { ok: true, activity, proposal };
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

    if (activity.title !== POKE_TITLE_LEGACY) {
      return res.status(400).json({ error: 'This activity is not a poke request' });
    }

    if (activity.poke_dismissed_at) {
      return res.status(400).json({ error: 'This update request is no longer active' });
    }

    if (activity.response_submitted_at) {
      return res.status(400).json({ error: 'This poke has already been answered' });
    }

    const proposal = await getProposalById(activity.proposal_id);
    if (!proposal || proposal.party_a_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const activity_date = normalizeProgressActivityDateInput(req.body);
    const title = req.body.title;
    const description = normalizeProgressDescriptionInput(req.body);
    const { support_file_url, comment } = req.body;

    if (!activity_date || !title?.trim()) {
      return res.status(400).json({ error: 'activity_date and title are required' });
    }

    if (!description) {
      return res.status(400).json({
        error: 'description is required (what was done)',
      });
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
        description,
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
    const [withPoke] = await attachPokeStatus([proposal]);
    return res.json({
      ...updated,
      poke_status: withPoke.poke_status,
      update_request: buildPokeWorkflowCapabilities(req, proposal, updated),
    });
  } catch (err) {
    console.error('Respond to poke error:', err.message);
    return res.status(500).json({ error: 'Failed to submit poke response' });
  }
}

async function editPokeResponse(req, res) {
  try {
    const activity = await getActivityById(req.params.activityId);
    const check = await verifyPokeReviewAccess(req, activity);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    if (!activity.response_submitted_at) {
      return res.status(400).json({ error: 'Party A has not submitted an update yet' });
    }

    const activity_date = normalizeProgressActivityDateInput(req.body);
    const title = req.body.title;
    const description = normalizeProgressDescriptionInput(req.body);
    const { support_file_url } = req.body;

    if (activity_date === null && req.body.activity_date !== undefined) {
      return res.status(400).json({ error: 'activity_date is invalid' });
    }
    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    if (
      description === null &&
      (req.body.description !== undefined || req.body.what_was_done !== undefined)
    ) {
      return res.status(400).json({ error: 'description cannot be empty' });
    }

    const updates = [];
    const values = [];

    if (activity_date !== null && req.body.activity_date !== undefined) {
      updates.push('response_date = ?');
      values.push(activity_date);
    }
    if (title !== undefined) {
      updates.push('response_title = ?');
      values.push(String(title).trim());
    }
    if (description !== null && (req.body.description !== undefined || req.body.what_was_done !== undefined)) {
      updates.push('response_description = ?');
      values.push(description);
    }
    if (support_file_url !== undefined) {
      updates.push('response_support_file_url = ?');
      values.push(support_file_url || null);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    values.push(req.params.activityId);
    await pool.query(`UPDATE proposal_activities SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = await getActivityWithRelations(req.params.activityId);
    const [withPoke] = await attachPokeStatus([check.proposal]);
    return res.json({
      ...updated,
      poke_status: withPoke.poke_status,
      update_request: buildPokeWorkflowCapabilities(req, check.proposal, updated),
    });
  } catch (err) {
    console.error('Edit poke response error:', err.message);
    return res.status(500).json({ error: 'Failed to edit update response' });
  }
}

async function promotePokeToProgress(req, res) {
  try {
    const activity = await getActivityById(req.params.activityId);
    const check = await verifyPokeReviewAccess(req, activity);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    if (!activity.response_submitted_at) {
      return res.status(400).json({ error: 'Party A has not submitted an update yet' });
    }

    const proposal = check.proposal;
    const activityDate = activity.response_date
      ? new Date(activity.response_date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const title = String(activity.response_title || 'Party A update').trim();
    const description = String(activity.response_description || '').trim();

    if (!description) {
      return res.status(400).json({ error: 'Update description is empty — edit the response first' });
    }

    const [insertResult] = await pool.query(
      `INSERT INTO proposal_activities
        (proposal_id, added_by, added_by_role, activity_date, title, description, support_file_url, status, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
      [
        proposal.id,
        req.user.id,
        req.user.role,
        activityDate,
        title,
        description,
        activity.response_support_file_url || null,
        PROGRESS_RECORDED_STATUS,
      ]
    );

    const progressId = insertResult.insertId;

    if (req.body.comment && String(req.body.comment).trim()) {
      await pool.query(
        `INSERT INTO activity_comments (activity_id, commented_by, commented_by_role, comment)
         VALUES (?, ?, ?, ?)`,
        [progressId, req.user.id, req.user.role, String(req.body.comment).trim()]
      );
    }

    await pool.query(
      `UPDATE proposal_activities
       SET response_promoted_at = NOW(),
           response_promoted_by = ?,
           promoted_progress_activity_id = ?
       WHERE id = ?`,
      [req.user.id, progressId, req.params.activityId]
    );

    const progressActivity = await getActivityWithRelations(progressId);
    const mouSync = await syncManualProgressToProposal(proposal, {
      description,
      activityDate,
      createdAt: progressActivity.created_at,
    });

    const [withPoke] = await attachPokeStatus([proposal]);
    const payload = mapActivityToProgress(progressActivity, req.user);
    if (mouSync) {
      payload.mou_fields_synced = mouSync.applied_fields;
      payload.mou_fields = mouSync.mou_fields;
    }

    return res.status(201).json({
      message: 'Party A update moved to Progress',
      progress_entry: payload,
      poke_status: withPoke.poke_status,
      update_request: buildPokeWorkflowCapabilities(req, proposal, null),
    });
  } catch (err) {
    console.error('Promote poke to progress error:', err.message);
    return res.status(500).json({ error: 'Failed to move update to Progress' });
  }
}

async function dismissUpdateRequestActivity(req, res) {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can dismiss update requests' });
    }

    const activity = await getActivityById(req.params.activityId);
    if (!activity || activity.title !== POKE_TITLE_LEGACY) {
      return res.status(404).json({ error: 'Update request not found' });
    }

    const ok = await dismissUpdateRequest(req.params.activityId, req.user.id);
    if (!ok) {
      return res.status(400).json({ error: 'Update request is already closed' });
    }

    const proposal = await getProposalById(activity.proposal_id);
    const [withPoke] = await attachPokeStatus([proposal]);
    return res.json({
      message: 'Update request dismissed',
      poke_status: withPoke.poke_status,
      update_request: buildPokeWorkflowCapabilities(req, proposal, null),
    });
  } catch (err) {
    console.error('Dismiss update request error:', err.message);
    return res.status(500).json({ error: 'Failed to dismiss update request' });
  }
}

async function dismissAllPendingUpdateRequestsHandler(req, res) {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can clear pending update requests' });
    }

    const result = await dismissAllPendingUpdateRequests(req.user.id);
    return res.json({
      message: 'All pending update requests cleared',
      ...result,
    });
  } catch (err) {
    console.error('Dismiss all pending update requests error:', err.message);
    return res.status(500).json({ error: 'Failed to clear pending update requests' });
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
  getProgressEntry,
  exportProposalProgress,
  updateProgressEntry,
  deleteProgressEntry,
  requestProgressEditUnlock,
  grantProgressEditUnlock,
  pokeForUpdate,
  respondToPoke,
  editPokeResponse,
  promotePokeToProgress,
  dismissUpdateRequestActivity,
  dismissAllPendingUpdateRequestsHandler,
  approveActivity,
  rejectActivity,
  addComment,
  getComments,
  uploadSupportFile,
};

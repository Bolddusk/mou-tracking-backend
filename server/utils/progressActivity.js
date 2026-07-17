const pool = require('../config/db');
const { enrichProposalRow, parseJsonField } = require('./proposalTemplate');

const POKE_TITLE = 'Update Requested';
const PROGRESS_RECORDED_STATUS = 'recorded';

const PROGRESS_TAB_SYNC_FIELD = 'executive_summary.progress';

const PROGRESS_FIELD_PATHS = {
  proposal_description: 'Outcome / Description',
  'executive_summary.progress': 'Progress',
  'executive_summary.bottlenecks': 'Bottleneck',
  'executive_summary.tentative_timeline': 'Tentative Timeline',
  'executive_summary.mou_operational_status': 'Status',
  'executive_summary.current_status': 'Current Status',
  'executive_summary.action_taken': 'Action Taken',
  'executive_summary.location': 'Location',
};

const PROGRESS_SHEET_COLUMNS = [
  { key: 'progress_date', label: 'Progress Date' },
  { key: 'recorded_at', label: 'Recorded At' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
  { key: 'added_by_name', label: 'Added By' },
  { key: 'added_by_role', label: 'Added By Role' },
  { key: 'source', label: 'Source' },
  { key: 'comments', label: 'Comments' },
  { key: 'support_file_url', label: 'Support File URL' },
];

function normalizeProgressDescriptionInput(body = {}) {
  const raw =
    body.description ??
    body.what_was_done ??
    body.whatWasDone ??
    body.work_done ??
    body.workDone ??
    null;
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text || null;
}

function normalizeProgressActivityDateInput(body = {}) {
  const raw = body.activity_date ?? body.work_date ?? body.workDate ?? body.progress_date ?? null;
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text;
}

function formatProgressRecordedAt(createdAt, activityDate = null) {
  const date = createdAt ? new Date(createdAt) : activityDate ? new Date(activityDate) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function buildManualProgressMouValue(description, { activityDate = null, createdAt = null } = {}) {
  const text = String(description || '').trim();
  if (!text) return null;
  const stamp = formatProgressRecordedAt(createdAt, activityDate);
  return stamp ? `[${stamp}] ${text}` : text;
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : ''), obj);
}

function normalizeProgressUpdates(updates) {
  const next = { ...updates };
  if (typeof next.executive_summary === 'string') {
    try {
      next.executive_summary = JSON.parse(next.executive_summary);
    } catch {
      next.executive_summary = {};
    }
  }
  return next;
}

function wasProgressFieldTouched(updates, path) {
  if (path === 'proposal_description') {
    return updates.proposal_description !== undefined;
  }
  const key = path.split('.')[1];
  const exec = updates.executive_summary;
  if (!exec || typeof exec !== 'object') return false;
  return exec[key] !== undefined;
}

function extractProgressFieldChanges(beforeRow, updates) {
  const parsedUpdates = normalizeProgressUpdates(updates);
  const before = enrichProposalRow(beforeRow);
  const mergedRow = { ...beforeRow };

  if (parsedUpdates.proposal_description !== undefined) {
    mergedRow.proposal_description = parsedUpdates.proposal_description;
  }
  if (parsedUpdates.executive_summary !== undefined) {
    mergedRow.executive_summary = JSON.stringify({
      ...before.executive_summary,
      ...parsedUpdates.executive_summary,
    });
  }

  const after = enrichProposalRow(mergedRow);
  const changes = [];

  Object.entries(PROGRESS_FIELD_PATHS).forEach(([path, label]) => {
    if (!wasProgressFieldTouched(parsedUpdates, path)) return;

    const oldValue = String(getByPath(before, path) || '').trim();
    const newValue = String(getByPath(after, path) || '').trim();
    if (oldValue === newValue) return;

    changes.push({
      field: path,
      label,
      old_value: oldValue || null,
      new_value: newValue || null,
    });
  });

  return changes;
}

function extractProgressTabFieldChanges(beforeRow, updates) {
  return extractProgressFieldChanges(beforeRow, updates).filter(
    (change) => change.field === PROGRESS_TAB_SYNC_FIELD
  );
}

function parseActivitySyncedFields(raw) {
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

function isProgressTabEntry(activity) {
  if (!activity) return false;
  if (activity.title === POKE_TITLE) return false;

  const source = activity.source || 'manual';
  if (source !== 'mou_field_sync') return true;

  const synced = parseActivitySyncedFields(activity.synced_fields);
  if (synced?.length) {
    return synced.some((change) => change.field === PROGRESS_TAB_SYNC_FIELD);
  }

  const firstLine = String(activity.description || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return Boolean(firstLine && /^Progress:/i.test(firstLine));
}

function filterProgressTabActivities(activities = []) {
  return activities.filter(isProgressTabEntry);
}

function buildProgressSyncDescription(changes) {
  return changes
    .map((change) => {
      const oldText = change.old_value || '—';
      const newText = change.new_value || '—';
      return `${change.label}: ${oldText} → ${newText}`;
    })
    .join('\n');
}

function formatCommentReportDate(createdAt) {
  if (!createdAt) return '';
  return new Date(createdAt).toISOString().slice(0, 10);
}

function formatCommentsForReport(comments = []) {
  if (!comments?.length) return '';

  return comments
    .map((comment) => {
      const text = String(comment.comment || comment.text || '').trim();
      if (!text) return '';

      const name = comment.commented_by_name || comment.author_name || '';
      const role = comment.commented_by_role || comment.author_role || '';
      const date = formatCommentReportDate(comment.created_at);

      return `${name} · ${role} · ${date}: ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

function formatCommentsPlain(comments = []) {
  if (!comments.length) return '';
  return comments
    .map((comment) => String(comment.comment || comment.text || '').trim())
    .filter(Boolean)
    .join(' | ');
}

function formatCommentsForSheet(comments = []) {
  return formatCommentsForReport(comments);
}

function formatCommentsDetail(comments = []) {
  return comments.map((comment) => ({
    id: comment.id,
    comment: comment.comment || comment.text || '',
    commented_by_name: comment.commented_by_name || comment.author_name || '',
    commented_by_role: comment.commented_by_role || comment.author_role || '',
    created_at: comment.created_at || null,
  }));
}

function isAdminRole(role) {
  return ['super_admin', 'admin'].includes(role);
}

function resolveProgressCapabilities(activity, user) {
  if (!user || !activity) {
    return {
      can_edit: false,
      can_delete: false,
      edit_locked: false,
      unlock_requested: false,
      can_request_unlock: false,
      can_grant_unlock: false,
    };
  }

  const isPoke = activity.title === POKE_TITLE || activity.is_poke;
  const isOwner = Number(activity.added_by) === Number(user.id);
  const isSA = isAdminRole(user.role);
  const isSL = user.role === 'sector_lead';
  const editLocked = Boolean(activity.edit_locked);
  const unlockRequested = Boolean(activity.edit_unlock_requested_at);

  let can_edit = false;
  let can_delete = false;

  if (!isPoke) {
    if (isSA) {
      can_edit = true;
      can_delete = true;
    } else if (isSL && isOwner && activity.added_by_role === 'sector_lead') {
      can_edit = !editLocked;
      can_delete = !editLocked && activity.source === 'manual';
    }
  }

  return {
    can_edit,
    can_delete,
    edit_locked: editLocked,
    unlock_requested: unlockRequested,
    can_request_unlock: isSL && isOwner && editLocked && !unlockRequested,
    can_grant_unlock: isSA && editLocked && unlockRequested,
  };
}

function formatProgressStatusLabel(status) {
  if (status === PROGRESS_RECORDED_STATUS) return 'Recorded';
  if (status === 'approved') return 'Recorded';
  if (status === 'pending') return 'Pending';
  if (status === 'rejected') return 'Rejected';
  return status || 'Recorded';
}

function formatProgressSheetRow(activity) {
  const commentsPlain = formatCommentsPlain(activity.comments);
  const commentsReport = formatCommentsForReport(activity.comments);
  const recordedAt = formatProgressRecordedAt(activity.created_at, activity.activity_date);
  return {
    id: activity.id,
    progress_date: activity.progress_date || activity.activity_date || null,
    activity_date: activity.activity_date || null,
    created_at: activity.created_at || null,
    recorded_at: recordedAt,
    title: activity.title || '',
    description: activity.description || '',
    status: formatProgressStatusLabel(activity.status),
    raw_status: activity.status,
    added_by_name: activity.added_by_name || '',
    added_by_role: activity.added_by_role || '',
    source: activity.source || 'manual',
    source_label: activity.source === 'mou_field_sync' ? 'MOU fields' : 'Manual entry',
    comments: commentsReport,
    comments_display: commentsPlain,
    support_file_url: activity.support_file_url || '',
    is_poke: Boolean(activity.is_poke),
    synced_fields: activity.synced_fields || null,
    edit_locked: Boolean(activity.edit_locked),
    unlock_requested: Boolean(activity.edit_unlock_requested_at),
    can_edit: Boolean(activity.can_edit),
    can_delete: Boolean(activity.can_delete),
  };
}

function mapActivityToProgress(activity, user = null) {
  const capabilities = resolveProgressCapabilities(activity, user);
  const enriched = { ...activity, ...capabilities };
  const recordedAt = formatProgressRecordedAt(activity.created_at, activity.activity_date);

  return {
    ...enriched,
    progress_date: activity.activity_date,
    created_at: activity.created_at || null,
    recorded_at: recordedAt,
    approval_required: false,
    can_approve: false,
    can_reject: false,
    status_label: formatProgressStatusLabel(activity.status),
    comments_display: formatCommentsPlain(activity.comments),
    comments_detail: formatCommentsDetail(activity.comments),
    sheet_row: formatProgressSheetRow(enriched),
  };
}

function labelToFieldPath(label) {
  const normalized = String(label || '').trim().toLowerCase();
  const entry = Object.entries(PROGRESS_FIELD_PATHS).find(
    ([, fieldLabel]) => fieldLabel.toLowerCase() === normalized
  );
  return entry ? entry[0] : null;
}

function parseProgressDescriptionToFieldValues(description) {
  if (!description) return {};

  const result = {};
  String(description)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(.+?):\s*(.+?)\s*(?:→|->)\s*(.+)$/);
      if (!match) return;

      const path = labelToFieldPath(match[1]);
      if (!path) return;

      result[path] = match[3].trim();
    });

  return result;
}

function normalizeMouFieldValuesInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result = {};
  Object.entries(raw).forEach(([key, value]) => {
    const nextValue = value === null || value === undefined ? '' : String(value).trim();
    if (key === 'proposal_description') {
      result.proposal_description = nextValue;
      return;
    }

    const path = key.includes('.') ? key : `executive_summary.${key}`;
    if (PROGRESS_FIELD_PATHS[path]) {
      result[path] = nextValue;
    }
  });

  return result;
}

function buildProposalSqlUpdatesFromFieldPaths(proposalRow, fieldPathValues) {
  if (!fieldPathValues || !Object.keys(fieldPathValues).length) {
    return { sqlUpdates: {}, applied: {} };
  }

  const before = enrichProposalRow(proposalRow);
  const sqlUpdates = {};
  const applied = {};
  const execPatch = { ...before.executive_summary };

  Object.entries(fieldPathValues).forEach(([path, value]) => {
    if (path === 'proposal_description') {
      sqlUpdates.proposal_description = value;
      applied.proposal_description = value;
      return;
    }

    if (path.startsWith('executive_summary.')) {
      const key = path.split('.')[1];
      execPatch[key] = value;
      applied[path] = value;
    }
  });

  if (Object.keys(applied).some((path) => path.startsWith('executive_summary.'))) {
    sqlUpdates.executive_summary = JSON.stringify(execPatch);
  }

  return { sqlUpdates, applied };
}

async function syncProgressEntryToProposal(proposalRow, activity, body = {}) {
  const shouldSync =
    activity.source === 'mou_field_sync' ||
    body.mou_field_values !== undefined ||
    body.sync_to_mou_fields === true;

  if (!shouldSync) return null;

  let fieldPathValues = normalizeMouFieldValuesInput(body.mou_field_values);

  if (!Object.keys(fieldPathValues).length && body.description !== undefined) {
    fieldPathValues = parseProgressDescriptionToFieldValues(body.description);
  }

  if (!Object.keys(fieldPathValues).length) return null;

  const { sqlUpdates, applied } = buildProposalSqlUpdatesFromFieldPaths(proposalRow, fieldPathValues);
  if (!Object.keys(sqlUpdates).length) return null;

  const setClause = Object.keys(sqlUpdates)
    .map((key) => `${key} = ?`)
    .join(', ');

  await pool.query(`UPDATE proposals SET ${setClause} WHERE id = ?`, [
    ...Object.values(sqlUpdates),
    proposalRow.id,
  ]);

  const enriched = enrichProposalRow({ ...proposalRow, ...sqlUpdates });
  return {
    synced: true,
    applied_fields: applied,
    mou_fields: {
      progress: enriched.executive_summary?.progress || '',
      bottlenecks: enriched.executive_summary?.bottlenecks || '',
      tentative_timeline: enriched.executive_summary?.tentative_timeline || '',
      mou_operational_status: enriched.executive_summary?.mou_operational_status || '',
      current_status: enriched.executive_summary?.current_status || '',
      action_taken: enriched.executive_summary?.action_taken || '',
      location: enriched.executive_summary?.location || '',
      proposal_description: enriched.proposal_description || '',
    },
  };
}

async function writeProposalProgressField(proposalRow, progressValue) {
  const before = enrichProposalRow(proposalRow);
  const nextProgress = progressValue == null ? '' : String(progressValue);
  const execPatch = { ...before.executive_summary, progress: nextProgress };

  await pool.query('UPDATE proposals SET executive_summary = ? WHERE id = ?', [
    JSON.stringify(execPatch),
    proposalRow.id,
  ]);

  const enriched = enrichProposalRow({ ...proposalRow, executive_summary: execPatch });
  return {
    synced: true,
    applied_fields: { 'executive_summary.progress': nextProgress },
    mou_fields: {
      progress: enriched.executive_summary?.progress || '',
      bottlenecks: enriched.executive_summary?.bottlenecks || '',
      tentative_timeline: enriched.executive_summary?.tentative_timeline || '',
      mou_operational_status: enriched.executive_summary?.mou_operational_status || '',
      current_status: enriched.executive_summary?.current_status || '',
      action_taken: enriched.executive_summary?.action_taken || '',
      location: enriched.executive_summary?.location || '',
      proposal_description: enriched.proposal_description || '',
    },
    restored_from_activity_id: null,
  };
}

function progressValueFromActivity(activity) {
  if (!activity) return '';

  const source = activity.source || 'manual';
  if (source === 'manual') {
    return (
      buildManualProgressMouValue(activity.description, {
        activityDate: activity.activity_date,
        createdAt: activity.created_at,
      }) || ''
    );
  }

  const synced = parseActivitySyncedFields(activity.synced_fields) || [];
  const progressChange = synced.find((change) => change.field === PROGRESS_TAB_SYNC_FIELD);
  if (progressChange && progressChange.new_value != null) {
    return String(progressChange.new_value);
  }

  return '';
}

/**
 * After a Progress-tab row is deleted, set Details/banner Progress to the
 * latest remaining entry — or clear if none left.
 */
async function resyncProposalProgressAfterDelete(proposalRow, deletedActivity) {
  if (!proposalRow?.id || !isProgressTabEntry(deletedActivity)) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT *
     FROM proposal_activities
     WHERE proposal_id = ?
     ORDER BY created_at DESC, id DESC`,
    [proposalRow.id]
  );

  const latest = filterProgressTabActivities(rows)[0] || null;
  const progressValue = progressValueFromActivity(latest);
  const result = await writeProposalProgressField(proposalRow, progressValue);
  result.restored_from_activity_id = latest ? Number(latest.id) : null;
  return result;
}

async function syncManualProgressToProposal(proposalRow, { description, activityDate, createdAt } = {}) {
  const progressValue = buildManualProgressMouValue(description, {
    activityDate,
    createdAt,
  });
  if (!progressValue) return null;

  return writeProposalProgressField(proposalRow, progressValue);
}

async function recordProgressFromFieldUpdates({ proposalId, user, beforeRow, updates }) {
  const changes = extractProgressTabFieldChanges(beforeRow, updates);
  if (!changes.length || !user?.id) return null;

  const today = new Date().toISOString().slice(0, 10);
  const description = buildProgressSyncDescription(changes);
  const title = 'Progress field updated';

  const [result] = await pool.query(
    `INSERT INTO proposal_activities
      (proposal_id, added_by, added_by_role, activity_date, title, description, status, source, synced_fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'mou_field_sync', ?)`,
    [
      proposalId,
      user.id,
      user.role,
      today,
      title,
      description,
      PROGRESS_RECORDED_STATUS,
      JSON.stringify(changes),
    ]
  );

  return {
    id: result.insertId,
    changes,
  };
}

module.exports = {
  POKE_TITLE,
  PROGRESS_RECORDED_STATUS,
  PROGRESS_FIELD_PATHS,
  PROGRESS_TAB_SYNC_FIELD,
  PROGRESS_SHEET_COLUMNS,
  extractProgressFieldChanges,
  extractProgressTabFieldChanges,
  isProgressTabEntry,
  filterProgressTabActivities,
  formatProgressSheetRow,
  formatProgressStatusLabel,
  formatCommentsForSheet,
  formatCommentsForReport,
  formatCommentsPlain,
  formatCommentsDetail,
  resolveProgressCapabilities,
  isAdminRole,
  mapActivityToProgress,
  parseProgressDescriptionToFieldValues,
  normalizeMouFieldValuesInput,
  buildProposalSqlUpdatesFromFieldPaths,
  syncProgressEntryToProposal,
  syncManualProgressToProposal,
  resyncProposalProgressAfterDelete,
  normalizeProgressDescriptionInput,
  normalizeProgressActivityDateInput,
  formatProgressRecordedAt,
  buildManualProgressMouValue,
  recordProgressFromFieldUpdates,
};

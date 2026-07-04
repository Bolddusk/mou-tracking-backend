const pool = require('../config/db');
const { KNOWN_CONFERENCES } = require('../constants/conferences');

const CONFERENCE_ENGAGEMENT_TYPES = ['B2B', 'B2G', 'G2B', 'G2G'];

const CONFERENCE_SELECT = `id, conference_key, name, conference_date, conference_end_date,
              location, host, report_title, engagement_type, description,
              supports_report, is_active, sort_order, created_at, updated_at`;

let cachedRows = null;

function normalizeEngagementType(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toUpperCase();
  if (!CONFERENCE_ENGAGEMENT_TYPES.includes(normalized)) return undefined;
  return normalized;
}

function formatConferenceRow(row, usage = null) {
  const payload = {
    id: row.id,
    key: row.conference_key,
    conference_key: row.conference_key,
    name: row.name,
    conference_date: row.conference_date,
    conference_end_date: row.conference_end_date,
    location: row.location,
    host: row.host,
    report_title: row.report_title,
    engagement_type: row.engagement_type || null,
    description: row.description || null,
    supports_report: Boolean(row.supports_report),
    is_active: Boolean(row.is_active),
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (usage) payload.usage = usage;
  return payload;
}

function toConferenceShape(row) {
  if (!row) return null;
  return {
    key: row.conference_key || row.key,
    name: row.name,
    date: row.conference_date || row.date || null,
    end_date: row.conference_end_date || row.end_date || null,
    location: row.location || null,
    host: row.host || null,
    report_title: row.report_title || null,
    engagement_type: row.engagement_type || null,
    description: row.description || null,
    supports_report: Boolean(row.supports_report),
  };
}

async function refreshConferenceCache() {
  try {
    const [rows] = await pool.query(
      `SELECT ${CONFERENCE_SELECT}
       FROM conferences
       ORDER BY sort_order ASC, name ASC`
    );
    cachedRows = rows;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      cachedRows = null;
      return null;
    }
    throw err;
  }
  return cachedRows;
}

async function ensureConferenceCache() {
  if (!cachedRows) {
    await refreshConferenceCache();
  }
  return cachedRows;
}

function getConferenceFromCacheByKey(key) {
  if (!cachedRows || !key) return null;
  const row = cachedRows.find((item) => item.conference_key === key && item.is_active);
  return row ? toConferenceShape(row) : null;
}

function getActiveConferenceOptions() {
  if (!cachedRows) {
    return KNOWN_CONFERENCES.map((item, index) => ({
      id: null,
      key: item.key,
      conference_key: item.key,
      name: item.name,
      supports_report: Boolean(item.supports_report),
      sort_order: index + 1,
    }));
  }
  return cachedRows
    .filter((row) => row.is_active)
    .map((row) => formatConferenceRow(row));
}

function isValidActiveConferenceKey(key) {
  if (!key) return false;
  if (cachedRows) {
    return cachedRows.some((row) => row.conference_key === key && row.is_active);
  }
  return KNOWN_CONFERENCES.some((item) => item.key === key);
}

async function getConferenceUsage(key) {
  const [[proposals]] = await pool.query(
    'SELECT COUNT(*) AS count FROM proposals WHERE conference_key = ?',
    [key]
  );
  return { proposals: Number(proposals.count) || 0 };
}

async function getConferenceRowById(id) {
  const [rows] = await pool.query(`SELECT ${CONFERENCE_SELECT} FROM conferences WHERE id = ?`, [id]);
  return rows[0] || null;
}

async function getConferenceRowByKey(key) {
  const normalized = normalizeConferenceKey(key);
  if (!normalized) return null;
  const [rows] = await pool.query(`SELECT ${CONFERENCE_SELECT} FROM conferences WHERE conference_key = ?`, [
    normalized,
  ]);
  return rows[0] || null;
}

async function resolveConferenceRow(id, body = {}) {
  const byId = await getConferenceRowById(id);
  if (byId) return byId;

  const key = body.conference_key || body.key;
  if (key) {
    return getConferenceRowByKey(key);
  }

  return null;
}

async function listActiveConferences() {
  await refreshConferenceCache();
  if (!cachedRows) {
    return KNOWN_CONFERENCES.map((item, index) =>
      formatConferenceRow({
        id: null,
        conference_key: item.key,
        name: item.name,
        conference_date: item.date,
        conference_end_date: item.end_date,
        location: item.location,
        host: item.host,
        report_title: item.report_title,
        engagement_type: item.engagement_type || 'B2B',
        description: item.description || null,
        supports_report: item.supports_report ? 1 : 0,
        is_active: 1,
        sort_order: index + 1,
      })
    );
  }
  return cachedRows.filter((row) => row.is_active).map((row) => formatConferenceRow(row));
}

async function listAllConferencesAdmin() {
  await refreshConferenceCache();
  const result = [];
  for (const row of cachedRows || []) {
    const usage = await getConferenceUsage(row.conference_key);
    result.push(formatConferenceRow(row, usage));
  }
  return result;
}

function normalizeConferenceKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function cascadeConferenceMetadataToProposals(row) {
  const conferenceInfoPatch = JSON.stringify({
    conference_name: row.name,
    conference_date: row.conference_date || '',
    conference_end_date: row.conference_end_date || '',
    conference_location: row.location || '',
    conference_host: row.host || '',
    conference_description: row.description || '',
  });

  await pool.query(
    `UPDATE proposals
     SET conference_name = ?,
         engagement_type = ?,
         conference_info = JSON_MERGE_PATCH(
           COALESCE(conference_info, '{}'),
           CAST(? AS JSON)
         )
     WHERE conference_key = ?`,
    [row.name, row.engagement_type || null, conferenceInfoPatch, row.conference_key]
  );
}

async function cascadeRenameConferenceKey(oldKey, newKey, newName, row) {
  await pool.query(
    'UPDATE proposals SET conference_key = ?, conference_name = ? WHERE conference_key = ?',
    [newKey, newName, oldKey]
  );

  const updatedRow = { ...row, conference_key: newKey, name: newName };
  await cascadeConferenceMetadataToProposals(updatedRow);
}

async function createConference(body) {
  const key = normalizeConferenceKey(body.conference_key || body.key);
  const name = String(body.name || '').trim();
  if (!key) return { error: 'conference_key is required', status: 400 };
  if (!name) return { error: 'name is required', status: 400 };

  const engagementType = normalizeEngagementType(body.engagement_type);
  if (body.engagement_type !== undefined && body.engagement_type !== null && body.engagement_type !== '') {
    if (engagementType === undefined) {
      return {
        error: `Invalid engagement_type. Use: ${CONFERENCE_ENGAGEMENT_TYPES.join(', ')}`,
        status: 400,
      };
    }
  }

  const [existing] = await pool.query('SELECT id FROM conferences WHERE conference_key = ?', [key]);
  if (existing.length) {
    return { error: 'Conference key already exists', status: 409 };
  }

  const [result] = await pool.query(
    `INSERT INTO conferences
      (conference_key, name, conference_date, conference_end_date, location, host, report_title, engagement_type, description, supports_report, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      key,
      name,
      body.conference_date || body.date || null,
      body.conference_end_date || body.end_date || null,
      body.location || null,
      body.host || null,
      body.report_title || null,
      engagementType || null,
      body.description || null,
      body.supports_report ? 1 : 0,
      Number(body.sort_order) || 0,
    ]
  );

  await refreshConferenceCache();
  const row = await getConferenceRowById(result.insertId);
  return { conference: formatConferenceRow(row) };
}

async function updateConference(id, body) {
  const row = await resolveConferenceRow(id, body);
  if (!row) return { error: 'Conference not found', status: 404 };

  const conferenceId = row.id;

  const updates = [];
  const params = [];
  let nextKey = row.conference_key;
  let nextName = row.name;

  if (body.conference_key !== undefined || body.key !== undefined) {
    const key = normalizeConferenceKey(body.conference_key || body.key);
    if (!key) return { error: 'conference_key cannot be empty', status: 400 };
    if (key !== row.conference_key) {
      const [dup] = await pool.query(
        'SELECT id FROM conferences WHERE conference_key = ? AND id != ?',
        [key, conferenceId]
      );
      if (dup.length) return { error: 'Conference key already exists', status: 409 };
      nextKey = key;
      updates.push('conference_key = ?');
      params.push(key);
    }
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return { error: 'name cannot be empty', status: 400 };
    nextName = name;
    updates.push('name = ?');
    params.push(name);
  }

  const optionalFields = [
    ['conference_date', body.conference_date ?? body.date],
    ['conference_end_date', body.conference_end_date ?? body.end_date],
    ['location', body.location],
    ['host', body.host],
    ['report_title', body.report_title],
    ['description', body.description],
  ];

  optionalFields.forEach(([column, value]) => {
    if (value !== undefined) {
      updates.push(`${column} = ?`);
      params.push(value || null);
    }
  });

  if (body.engagement_type !== undefined) {
    if (body.engagement_type === null || body.engagement_type === '') {
      updates.push('engagement_type = ?');
      params.push(null);
    } else {
      const engagementType = normalizeEngagementType(body.engagement_type);
      if (engagementType === undefined) {
        return {
          error: `Invalid engagement_type. Use: ${CONFERENCE_ENGAGEMENT_TYPES.join(', ')}`,
          status: 400,
        };
      }
      updates.push('engagement_type = ?');
      params.push(engagementType);
    }
  }

  if (body.supports_report !== undefined) {
    updates.push('supports_report = ?');
    params.push(body.supports_report ? 1 : 0);
  }
  if (body.is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(body.is_active ? 1 : 0);
  }
  if (body.sort_order !== undefined) {
    updates.push('sort_order = ?');
    params.push(Number(body.sort_order) || 0);
  }

  if (!updates.length) return { error: 'No fields to update', status: 400 };

  await pool.query(`UPDATE conferences SET ${updates.join(', ')} WHERE id = ?`, [...params, conferenceId]);

  if (nextKey !== row.conference_key || nextName !== row.name) {
    const updatedRow = await getConferenceRowById(conferenceId);
    await cascadeRenameConferenceKey(row.conference_key, nextKey, nextName, updatedRow);
  } else {
    const updatedRow = await getConferenceRowById(conferenceId);
    const metadataChanged =
      (body.description !== undefined && (body.description || null) !== (row.description || null)) ||
      (body.engagement_type !== undefined &&
        (normalizeEngagementType(body.engagement_type) || null) !== (row.engagement_type || null)) ||
      body.conference_date !== undefined ||
      body.conference_end_date !== undefined ||
      body.date !== undefined ||
      body.end_date !== undefined ||
      body.location !== undefined ||
      body.host !== undefined;

    if (metadataChanged) {
      await cascadeConferenceMetadataToProposals(updatedRow);
    } else if (nextName !== row.name) {
      await pool.query('UPDATE proposals SET conference_name = ? WHERE conference_key = ?', [
        nextName,
        nextKey,
      ]);
    }
  }

  await refreshConferenceCache();
  const updated = await getConferenceRowById(conferenceId);
  const usage = await getConferenceUsage(updated.conference_key);
  return { conference: formatConferenceRow(updated, usage) };
}

async function deleteConference(id) {
  const row = await getConferenceRowById(id);
  if (!row) return { error: 'Conference not found', status: 404 };

  const usage = await getConferenceUsage(row.conference_key);
  if (usage.proposals > 0) {
    return {
      error: 'Conference is linked to proposals and cannot be deleted. Deactivate it instead.',
      status: 409,
      usage,
    };
  }

  await pool.query('DELETE FROM conferences WHERE id = ?', [id]);
  await refreshConferenceCache();
  return { message: 'Conference deleted', id: Number(id), key: row.conference_key };
}

module.exports = {
  CONFERENCE_ENGAGEMENT_TYPES,
  normalizeEngagementType,
  formatConferenceRow,
  toConferenceShape,
  refreshConferenceCache,
  ensureConferenceCache,
  getConferenceFromCacheByKey,
  getActiveConferenceOptions,
  isValidActiveConferenceKey,
  getConferenceUsage,
  listActiveConferences,
  listAllConferencesAdmin,
  getConferenceRowById,
  getConferenceRowByKey,
  resolveConferenceRow,
  createConference,
  updateConference,
  deleteConference,
};

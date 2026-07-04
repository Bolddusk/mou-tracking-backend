const pool = require('../config/db');
const { DEFAULT_SIFC_CATEGORIES } = require('../constants/sifcCategories');

let cachedRows = null;

function formatSifcCategoryRow(row, usage = null) {
  const payload = {
    id: row.id,
    name: row.name,
    is_active: Boolean(row.is_active),
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (usage) payload.usage = usage;
  return payload;
}

async function refreshSifcCategoryCache() {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, is_active, sort_order, created_at, updated_at
       FROM sifc_categories
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

async function ensureSifcCategoryCache() {
  if (!cachedRows) {
    await refreshSifcCategoryCache();
  }
  return cachedRows;
}

function getActiveSifcCategoryNames() {
  if (!cachedRows) return [...DEFAULT_SIFC_CATEGORIES];
  return cachedRows.filter((row) => row.is_active).map((row) => row.name);
}

function isValidActiveSifcCategory(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  return getActiveSifcCategoryNames().includes(trimmed);
}

async function getSifcCategoryUsage(name) {
  const [[proposals]] = await pool.query(
    `SELECT COUNT(*) AS count FROM proposals
     WHERE JSON_UNQUOTE(JSON_EXTRACT(executive_summary, '$.sifc_category')) = ?`,
    [name]
  );
  return { proposals: Number(proposals.count) || 0 };
}

async function getSifcCategoryRowById(id) {
  const [rows] = await pool.query(
    `SELECT id, name, is_active, sort_order, created_at, updated_at FROM sifc_categories WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function listActiveSifcCategories() {
  await refreshSifcCategoryCache();
  if (!cachedRows) {
    return DEFAULT_SIFC_CATEGORIES.map((name, index) =>
      formatSifcCategoryRow({
        id: null,
        name,
        is_active: 1,
        sort_order: index + 1,
      })
    );
  }
  return cachedRows.filter((row) => row.is_active).map((row) => formatSifcCategoryRow(row));
}

async function listAllSifcCategoriesAdmin() {
  await refreshSifcCategoryCache();
  const result = [];
  for (const row of cachedRows || []) {
    const usage = await getSifcCategoryUsage(row.name);
    result.push(formatSifcCategoryRow(row, usage));
  }
  return result;
}

async function cascadeRenameSifcCategory(oldName, newName) {
  await pool.query(
    `UPDATE proposals
     SET executive_summary = JSON_SET(
       COALESCE(executive_summary, JSON_OBJECT()),
       '$.sifc_category',
       ?
     )
     WHERE JSON_UNQUOTE(JSON_EXTRACT(executive_summary, '$.sifc_category')) = ?`,
    [newName, oldName]
  );
}

async function createSifcCategory(name, sortOrder = 0) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return { error: 'name is required', status: 400 };
  if (trimmed.length > 255) return { error: 'name must be 255 characters or fewer', status: 400 };

  const [existing] = await pool.query('SELECT id FROM sifc_categories WHERE name = ?', [trimmed]);
  if (existing.length) return { error: 'SIFC category already exists', status: 409 };

  const [result] = await pool.query(
    'INSERT INTO sifc_categories (name, sort_order, is_active) VALUES (?, ?, 1)',
    [trimmed, Number(sortOrder) || 0]
  );

  await refreshSifcCategoryCache();
  const row = await getSifcCategoryRowById(result.insertId);
  return { category: formatSifcCategoryRow(row) };
}

async function updateSifcCategory(id, body) {
  const row = await getSifcCategoryRowById(id);
  if (!row) return { error: 'SIFC category not found', status: 404 };

  const updates = [];
  const params = [];
  let nextName = row.name;

  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) return { error: 'name cannot be empty', status: 400 };
    if (trimmed.length > 255) return { error: 'name must be 255 characters or fewer', status: 400 };
    if (trimmed !== row.name) {
      const [dup] = await pool.query('SELECT id FROM sifc_categories WHERE name = ? AND id != ?', [
        trimmed,
        id,
      ]);
      if (dup.length) return { error: 'SIFC category already exists', status: 409 };
      nextName = trimmed;
      updates.push('name = ?');
      params.push(trimmed);
    }
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

  await pool.query(`UPDATE sifc_categories SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);

  if (nextName !== row.name) {
    await cascadeRenameSifcCategory(row.name, nextName);
  }

  await refreshSifcCategoryCache();
  const updated = await getSifcCategoryRowById(id);
  const usage = await getSifcCategoryUsage(updated.name);
  return { category: formatSifcCategoryRow(updated, usage) };
}

async function deleteSifcCategory(id) {
  const row = await getSifcCategoryRowById(id);
  if (!row) return { error: 'SIFC category not found', status: 404 };

  const usage = await getSifcCategoryUsage(row.name);
  if (usage.proposals > 0) {
    return {
      error: 'SIFC category is in use and cannot be deleted. Deactivate it instead.',
      status: 409,
      usage,
    };
  }

  await pool.query('DELETE FROM sifc_categories WHERE id = ?', [id]);
  await refreshSifcCategoryCache();
  return { message: 'SIFC category deleted', id: Number(id), name: row.name };
}

module.exports = {
  formatSifcCategoryRow,
  refreshSifcCategoryCache,
  ensureSifcCategoryCache,
  getActiveSifcCategoryNames,
  isValidActiveSifcCategory,
  listActiveSifcCategories,
  listAllSifcCategoriesAdmin,
  getSifcCategoryRowById,
  createSifcCategory,
  updateSifcCategory,
  deleteSifcCategory,
};

const pool = require('../config/db');
const { SECTORS: DEFAULT_SECTORS } = require('../constants/sectors');

let cachedRows = null;

function formatSectorRow(row, usage = null) {
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

async function refreshSectorCache() {
  const [rows] = await pool.query(
    `SELECT id, name, is_active, sort_order, created_at, updated_at
     FROM sectors
     ORDER BY sort_order ASC, name ASC`
  );
  cachedRows = rows;
  return cachedRows;
}

async function ensureSectorCache() {
  if (!cachedRows) {
    await refreshSectorCache();
  }
  return cachedRows;
}

function getActiveSectorNames() {
  if (!cachedRows) return [...DEFAULT_SECTORS];
  return cachedRows.filter((row) => row.is_active).map((row) => row.name);
}

function getAllSectorNames() {
  if (!cachedRows) return [...DEFAULT_SECTORS];
  return cachedRows.map((row) => row.name);
}

function isValidActiveSector(name) {
  return getActiveSectorNames().includes(name);
}

async function getSectorUsage(name) {
  const [[proposals]] = await pool.query(
    'SELECT COUNT(*) AS count FROM proposals WHERE sector = ?',
    [name]
  );
  const [[users]] = await pool.query('SELECT COUNT(*) AS count FROM users WHERE sector = ?', [name]);
  const [[mmProposals]] = await pool.query(
    'SELECT COUNT(*) AS count FROM mm_proposals WHERE sector = ?',
    [name]
  );

  const proposalCount = Number(proposals.count) || 0;
  const userCount = Number(users.count) || 0;
  const mmProposalCount = Number(mmProposals.count) || 0;

  return {
    proposals: proposalCount,
    users: userCount,
    mm_proposals: mmProposalCount,
    total: proposalCount + userCount + mmProposalCount,
  };
}

async function getSectorRowById(id) {
  const [rows] = await pool.query(
    `SELECT id, name, is_active, sort_order, created_at, updated_at FROM sectors WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function listActiveSectors() {
  await ensureSectorCache();
  return cachedRows.filter((row) => row.is_active).map((row) => formatSectorRow(row));
}

async function listAllSectorsAdmin() {
  await ensureSectorCache();
  const result = [];
  for (const row of cachedRows) {
    const usage = await getSectorUsage(row.name);
    result.push(formatSectorRow(row, usage));
  }
  return result;
}

async function cascadeRenameSector(oldName, newName) {
  await pool.query('UPDATE proposals SET sector = ? WHERE sector = ?', [newName, oldName]);
  await pool.query('UPDATE users SET sector = ? WHERE sector = ?', [newName, oldName]);
  await pool.query('UPDATE mm_proposals SET sector = ? WHERE sector = ?', [newName, oldName]);
}

async function createSector(name, sortOrder = 0) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return { error: 'name is required', status: 400 };
  }
  if (trimmed.length > 255) {
    return { error: 'name must be 255 characters or fewer', status: 400 };
  }

  const [existing] = await pool.query('SELECT id FROM sectors WHERE name = ?', [trimmed]);
  if (existing.length) {
    return { error: 'Sector name already exists', status: 409 };
  }

  const [result] = await pool.query(
    'INSERT INTO sectors (name, sort_order, is_active) VALUES (?, ?, 1)',
    [trimmed, Number(sortOrder) || 0]
  );

  await refreshSectorCache();
  const row = await getSectorRowById(result.insertId);
  return { sector: formatSectorRow(row) };
}

async function updateSector(id, body) {
  const row = await getSectorRowById(id);
  if (!row) {
    return { error: 'Sector not found', status: 404 };
  }

  const updates = [];
  const params = [];
  let nextName = row.name;

  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) {
      return { error: 'name cannot be empty', status: 400 };
    }
    if (trimmed.length > 255) {
      return { error: 'name must be 255 characters or fewer', status: 400 };
    }
    if (trimmed !== row.name) {
      const [dup] = await pool.query('SELECT id FROM sectors WHERE name = ? AND id != ?', [
        trimmed,
        id,
      ]);
      if (dup.length) {
        return { error: 'Sector name already exists', status: 409 };
      }
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

  if (!updates.length) {
    return { error: 'No fields to update', status: 400 };
  }

  await pool.query(`UPDATE sectors SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);

  if (nextName !== row.name) {
    await cascadeRenameSector(row.name, nextName);
  }

  await refreshSectorCache();
  const updated = await getSectorRowById(id);
  const usage = await getSectorUsage(updated.name);
  return { sector: formatSectorRow(updated, usage) };
}

async function deleteSector(id) {
  const row = await getSectorRowById(id);
  if (!row) {
    return { error: 'Sector not found', status: 404 };
  }

  const usage = await getSectorUsage(row.name);
  if (usage.total > 0) {
    return {
      error: 'Sector is in use and cannot be deleted. Deactivate it instead.',
      status: 409,
      usage,
    };
  }

  await pool.query('DELETE FROM sectors WHERE id = ?', [id]);
  await refreshSectorCache();
  return { message: 'Sector deleted', id: Number(id), name: row.name };
}

module.exports = {
  DEFAULT_SECTORS,
  formatSectorRow,
  refreshSectorCache,
  ensureSectorCache,
  getActiveSectorNames,
  getAllSectorNames,
  isValidActiveSector,
  getSectorUsage,
  listActiveSectors,
  listAllSectorsAdmin,
  getSectorRowById,
  createSector,
  updateSector,
  deleteSector,
};

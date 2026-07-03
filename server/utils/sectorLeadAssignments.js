const pool = require('../config/db');
const { getActiveSectorNames, ensureSectorCache } = require('./sectorRegistry');

async function getAssignmentsForUser(userId, connection = null) {
  const q = connection ? connection.query.bind(connection) : pool.query.bind(pool);
  const [rows] = await q(
    `SELECT id, user_id, sector, is_primary, assigned_at, assigned_by
     FROM sector_lead_assignments
     WHERE user_id = ?
     ORDER BY is_primary DESC, sector ASC`,
    [userId]
  );
  return rows;
}

async function getSectorNamesForUser(userId, connection = null) {
  const rows = await getAssignmentsForUser(userId, connection);
  return rows.map((row) => row.sector);
}

async function getPrimarySectorForUser(userId, connection = null) {
  const rows = await getAssignmentsForUser(userId, connection);
  const primary = rows.find((row) => row.is_primary);
  return primary?.sector || rows[0]?.sector || null;
}

function sectorLeadCoversSector(user, sector) {
  if (!sector) return false;
  const assigned = user?.assigned_sectors;
  if (Array.isArray(assigned) && assigned.length) {
    return assigned.includes(sector);
  }
  return String(user?.sector || '') === String(sector);
}

function getSectorLeadScopedSectors(user) {
  if (Array.isArray(user?.assigned_sectors) && user.assigned_sectors.length) {
    return user.assigned_sectors;
  }
  const legacy = String(user?.sector || '').trim();
  return legacy ? [legacy] : [];
}

function sectorLeadHasAnySector(user) {
  return getSectorLeadScopedSectors(user).length > 0;
}

async function attachSectorLeadSectors(user) {
  if (!user || user.role !== 'sector_lead') {
    return user;
  }
  const assignments = await getAssignmentsForUser(user.id);
  const assigned_sectors = assignments.map((row) => row.sector);
  const primary_sector =
    assignments.find((row) => row.is_primary)?.sector ||
    assigned_sectors[0] ||
    user.sector ||
    null;

  return {
    ...user,
    assigned_sectors,
    primary_sector,
    sector: primary_sector,
  };
}

async function syncUserPrimarySector(userId, primarySector, connection = null) {
  const q = connection ? connection.query.bind(connection) : pool.query.bind(pool);
  await q('UPDATE users SET sector = ? WHERE id = ? AND role = ?', [
    primarySector,
    userId,
    'sector_lead',
  ]);
}

async function replaceAssignments(userId, sectors, { primarySector = null, assignedBy = null } = {}) {
  await ensureSectorCache();
  const active = getActiveSectorNames();
  const unique = [...new Set(sectors.map((s) => String(s).trim()).filter(Boolean))];

  for (const sector of unique) {
    if (!active.includes(sector)) {
      return { error: `Invalid sector: ${sector}`, status: 400 };
    }
  }

  const primary = primarySector && unique.includes(primarySector) ? primarySector : unique[0] || null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM sector_lead_assignments WHERE user_id = ?', [userId]);

    for (const sector of unique) {
      await connection.query(
        `INSERT INTO sector_lead_assignments (user_id, sector, is_primary, assigned_by)
         VALUES (?, ?, ?, ?)`,
        [userId, sector, sector === primary ? 1 : 0, assignedBy]
      );
    }

    await syncUserPrimarySector(userId, primary, connection);
    await connection.commit();

    return {
      ok: true,
      sectors: unique,
      primary_sector: primary,
      assignments: await getAssignmentsForUser(userId),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function getSectorLeadUserIdsForSector(sector, excludeUserId = null, connection = null) {
  const q = connection ? connection.query.bind(connection) : pool.query.bind(pool);
  const params = [sector];
  let sql = `SELECT DISTINCT user_id FROM sector_lead_assignments WHERE sector = ?`;
  if (excludeUserId) {
    sql += ' AND user_id != ?';
    params.push(excludeUserId);
  }
  const [rows] = await q(sql, params);
  return rows.map((row) => row.user_id);
}

async function userIsAssignedToSector(userId, sector, connection = null) {
  const q = connection ? connection.query.bind(connection) : pool.query.bind(pool);
  const [rows] = await q(
    'SELECT id FROM sector_lead_assignments WHERE user_id = ? AND sector = ? LIMIT 1',
    [userId, sector]
  );
  return rows.length > 0;
}

async function listSectorLeadsWithAssignments(sectorFilter = null) {
  let sql = `SELECT u.id, u.full_name, u.email, u.sector AS primary_sector, u.organization, u.phone
             FROM users u WHERE u.role = 'sector_lead'`;
  const params = [];

  if (sectorFilter) {
    sql += ` AND EXISTS (
      SELECT 1 FROM sector_lead_assignments a
      WHERE a.user_id = u.id AND a.sector = ?
    )`;
    params.push(sectorFilter);
  }

  sql += ' ORDER BY u.full_name ASC';
  const [users] = await pool.query(sql, params);

  const result = [];
  for (const user of users) {
    const assignments = await getAssignmentsForUser(user.id);
    result.push({
      ...user,
      sectors: assignments.map((a) => a.sector),
      assignments,
    });
  }
  return result;
}

async function cascadeRenameSector(oldName, newName, connection = null) {
  const q = connection ? connection.query.bind(connection) : pool.query.bind(pool);
  await q('UPDATE sector_lead_assignments SET sector = ? WHERE sector = ?', [newName, oldName]);
}

module.exports = {
  getAssignmentsForUser,
  getSectorNamesForUser,
  getPrimarySectorForUser,
  sectorLeadCoversSector,
  sectorLeadHasAnySector,
  getSectorLeadScopedSectors,
  attachSectorLeadSectors,
  syncUserPrimarySector,
  replaceAssignments,
  getSectorLeadUserIdsForSector,
  userIsAssignedToSector,
  listSectorLeadsWithAssignments,
  cascadeRenameSector,
};

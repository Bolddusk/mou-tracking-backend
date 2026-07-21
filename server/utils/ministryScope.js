const pool = require('../config/db');

const GLOBAL_ROLES = new Set(['super_admin', 'power_admin']);
const MINISTRY_REQUIRED_ROLES = new Set([
  'party_a',
  'party_b',
  'sector_lead',
  'admin',
  'investor',
  'focal_point',
  'regional_focal_point',
]);

function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}

function isPowerAdmin(user) {
  return user?.role === 'power_admin';
}

function isGlobalRole(user) {
  return GLOBAL_ROLES.has(user?.role);
}

function roleRequiresMinistry(role) {
  return MINISTRY_REQUIRED_ROLES.has(role);
}

/** null = no SQL ministry filter (global roles). Number = restrict to that ministry. */
function getMinistryFilter(user, queryMinistryId = null) {
  if (isGlobalRole(user)) {
    const q = queryMinistryId != null && queryMinistryId !== '' ? Number(queryMinistryId) : null;
    return q || null;
  }
  return user?.ministry_id ? Number(user.ministry_id) : null;
}

function assertMinistryAccess(user, entityMinistryId) {
  if (isGlobalRole(user)) return { ok: true };
  if (!user?.ministry_id) {
    return { ok: false, status: 403, error: 'Your account has no ministry assigned' };
  }
  if (Number(entityMinistryId) !== Number(user.ministry_id)) {
    return { ok: false, status: 403, error: 'Access denied — outside your ministry' };
  }
  return { ok: true };
}

function canPowerAdminMutate(action) {
  return action === 'comment' || action === 'chat';
}

async function getMinistryById(id) {
  if (!id) return null;
  const [rows] = await pool.query(
    `SELECT id, code, name, is_active, created_at, updated_at FROM ministries WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function getMinistryByCode(code) {
  const [rows] = await pool.query(
    `SELECT id, code, name, is_active FROM ministries WHERE code = ? LIMIT 1`,
    [String(code || '').trim().toLowerCase()]
  );
  return rows[0] || null;
}

function formatMinistry(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    is_active: row.is_active == null ? true : Boolean(row.is_active),
  };
}

async function resolveMinistryIdForWrite(user, requestedMinistryId) {
  if (isSuperAdmin(user) || isPowerAdmin(user)) {
    const id = Number(requestedMinistryId);
    if (!id) {
      return { error: 'ministry_id is required', status: 400 };
    }
    const ministry = await getMinistryById(id);
    if (!ministry || !ministry.is_active) {
      return { error: 'Invalid or inactive ministry', status: 400 };
    }
    return { ministryId: ministry.id, ministry };
  }

  if (!user?.ministry_id) {
    return { error: 'Your account has no ministry assigned', status: 403 };
  }

  const id = requestedMinistryId != null ? Number(requestedMinistryId) : Number(user.ministry_id);
  if (id !== Number(user.ministry_id)) {
    return { error: 'You can only create records for your own ministry', status: 403 };
  }

  const ministry = await getMinistryById(id);
  if (!ministry || !ministry.is_active) {
    return { error: 'Invalid or inactive ministry', status: 400 };
  }
  return { ministryId: ministry.id, ministry };
}

module.exports = {
  GLOBAL_ROLES,
  MINISTRY_REQUIRED_ROLES,
  isSuperAdmin,
  isPowerAdmin,
  isGlobalRole,
  roleRequiresMinistry,
  getMinistryFilter,
  assertMinistryAccess,
  canPowerAdminMutate,
  getMinistryById,
  getMinistryByCode,
  formatMinistry,
  resolveMinistryIdForWrite,
};

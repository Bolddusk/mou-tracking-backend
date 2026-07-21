const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { issueTemporaryCredentials } = require('../utils/partyBCredentials');
const {
  VALID_ROLES,
  ROLE_LABELS,
  USER_TABS,
  formatPublicUser,
  isValidRole,
  roleRequiresSector,
  getTabByKey,
} = require('../utils/userHelpers');
const { getPermissionsForRole } = require('../utils/rolePermissions');
const {
  getUserReferences,
  unlinkDeletableUserReferences,
  parseUnlinkReferencesFlag,
} = require('../utils/userDeleteReferences');

const USER_SELECT = `
  SELECT id, full_name, email, role, ministry_id, sector, organization, phone, created_at
  FROM users
`;

async function getUserRowById(userId) {
  const [rows] = await pool.query(`${USER_SELECT} WHERE id = ?`, [userId]);
  return rows[0] || null;
}

async function countSuperAdmins(excludeId = null) {
  const params = [];
  let sql = "SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin'";
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [[row]] = await pool.query(sql, params);
  return row.count;
}

function validateRoleAndSector(role, sector) {
  if (!isValidRole(role)) {
    return {
      error: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}. Investor and Focal Point roles are removed.`,
    };
  }
  if (roleRequiresSector(role) && !sector?.trim()) {
    return { error: 'sector is required for sector_lead' };
  }
  return { ok: true };
}

async function getSectorLeads(req, res) {
  try {
    let query = `SELECT u.id, u.full_name, u.email, u.sector AS primary_sector
       FROM users u
       WHERE u.role = 'sector_lead'`;
    const params = [];

    if (req.query.sector) {
      query += ` AND EXISTS (
        SELECT 1 FROM sector_lead_assignments a
        WHERE a.user_id = u.id AND a.sector = ?
      )`;
      params.push(req.query.sector);
    }

    query += ' ORDER BY u.full_name ASC';

    const [rows] = await pool.query(query, params);

    const enriched = [];
    for (const row of rows) {
      const [assignments] = await pool.query(
        `SELECT sector, is_primary FROM sector_lead_assignments
         WHERE user_id = ? ORDER BY is_primary DESC, sector ASC`,
        [row.id]
      );
      enriched.push({
        ...row,
        sectors: assignments.map((a) => a.sector),
        sector: row.primary_sector,
      });
    }

    return res.json(enriched);
  } catch (err) {
    console.error('Get sector leads error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sector leads' });
  }
}

async function getRegionalFocalPoints(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, email, sector
       FROM users
       WHERE role = 'regional_focal_point'
       ORDER BY full_name ASC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('Get regional focal points error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch regional focal points' });
  }
}

async function getRoles(req, res) {
  try {
    const roles = await Promise.all(
      VALID_ROLES.map(async (role) => ({
        value: role,
        label: ROLE_LABELS[role] || role,
        requires_sector: roleRequiresSector(role),
        permissions: await getPermissionsForRole(role),
      }))
    );
    return res.json(roles);
  } catch (err) {
    console.error('Get roles error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch roles' });
  }
}

async function getUserTabs(req, res) {
  try {
    const tabs = [];
    for (const tab of USER_TABS) {
      const placeholders = tab.roles.map(() => '?').join(', ');
      const [[row]] = await pool.query(
        `SELECT COUNT(*) AS count FROM users WHERE role IN (${placeholders})`,
        tab.roles
      );
      tabs.push({
        key: tab.key,
        label: tab.label,
        count: Number(row.count) || 0,
      });
    }
    return res.json({ tabs });
  } catch (err) {
    console.error('Get user tabs error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch user tabs' });
  }
}

async function listUsers(req, res) {
  try {
    const { role, search, tab, ministry_id } = req.query;
    const conditions = [];
    const params = [];

    const { isGlobalRole, getMinistryFilter } = require('../utils/ministryScope');
    const ministryFilter = getMinistryFilter(req.user, ministry_id);
    if (!isGlobalRole(req.user) && req.user.ministry_id) {
      conditions.push('ministry_id = ?');
      params.push(req.user.ministry_id);
    } else if (ministryFilter) {
      conditions.push('ministry_id = ?');
      params.push(ministryFilter);
    }

    const tabDef = getTabByKey(tab);
    if (tab && !tabDef) {
      return res.status(400).json({
        error: `Invalid tab. Use: ${USER_TABS.map((t) => t.key).join(', ')}`,
      });
    }

    if (tabDef) {
      const placeholders = tabDef.roles.map(() => '?').join(', ');
      conditions.push(`role IN (${placeholders})`);
      params.push(...tabDef.roles);
    } else if (role) {
      if (!isValidRole(role)) {
        return res.status(400).json({
          error: 'Invalid role filter. Investor and Focal Point are removed from user management.',
        });
      }
      conditions.push('role = ?');
      params.push(role);
    } else {
      const placeholders = VALID_ROLES.map(() => '?').join(', ');
      conditions.push(`role IN (${placeholders})`);
      params.push(...VALID_ROLES);
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(full_name LIKE ? OR email LIKE ? OR organization LIKE ?)');
      params.push(term, term, term);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `${USER_SELECT} ${where} ORDER BY created_at DESC`,
      params
    );

    const tabCountConditions = [];
    const tabCountParams = [];
    if (!isGlobalRole(req.user) && req.user.ministry_id) {
      tabCountConditions.push('ministry_id = ?');
      tabCountParams.push(req.user.ministry_id);
    } else if (ministryFilter) {
      tabCountConditions.push('ministry_id = ?');
      tabCountParams.push(ministryFilter);
    }

    const tabs = [];
    for (const t of USER_TABS) {
      const placeholders = t.roles.map(() => '?').join(', ');
      const parts = [`role IN (${placeholders})`, ...tabCountConditions];
      const [[row]] = await pool.query(
        `SELECT COUNT(*) AS count FROM users WHERE ${parts.join(' AND ')}`,
        [...t.roles, ...tabCountParams]
      );
      tabs.push({
        key: t.key,
        label: t.label,
        count: Number(row.count) || 0,
      });
    }

    return res.json({
      data: rows.map(formatPublicUser),
      tab: tabDef ? tabDef.key : null,
      tabs,
      total: rows.length,
      ministry_id: ministryFilter || null,
    });
  } catch (err) {
    console.error('List users error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
}

async function getUserById(req, res) {
  try {
    const user = await getUserRowById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { stats } = await getUserReferences(user.id);

    return res.json({
      ...formatPublicUser(user),
      stats,
    });
  } catch (err) {
    console.error('Get user error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
}

async function createUser(req, res) {
  try {
    const { full_name, email, password, role, sector, organization, phone, ministry_id } =
      req.body;

    if (!full_name?.trim() || !email?.trim() || !password || !role) {
      return res.status(400).json({
        error: 'full_name, email, password, and role are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const roleCheck = validateRoleAndSector(role, sector);
    if (roleCheck.error) {
      return res.status(400).json({ error: roleCheck.error });
    }

    const { roleRequiresMinistry, getMinistryById } = require('../utils/ministryScope');
    const { GLOBAL_USER_ROLES } = require('../utils/userHelpers');
    let ministryId = null;
    if (GLOBAL_USER_ROLES.has(role)) {
      ministryId = null;
    } else {
      ministryId = ministry_id ? Number(ministry_id) : null;
      if (!ministryId) {
        return res.status(400).json({ error: 'ministry_id is required for this role' });
      }
      const ministry = await getMinistryById(ministryId);
      if (!ministry || !ministry.is_active) {
        return res.status(400).json({ error: 'Invalid or inactive ministry' });
      }
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password, role, ministry_id, sector, organization, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        role,
        ministryId,
        roleRequiresSector(role) ? sector.trim() : sector?.trim() || null,
        organization?.trim() || null,
        phone?.trim() || null,
      ]
    );

    const user = await getUserRowById(result.insertId);
    return res.status(201).json(formatPublicUser(user));
  } catch (err) {
    console.error('Create user error:', err.message);
    return res.status(500).json({ error: 'Failed to create user' });
  }
}

async function updateUser(req, res) {
  try {
    const user = await getUserRowById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { full_name, email, organization, phone, sector } = req.body;
    const updates = [];
    const params = [];

    if (full_name !== undefined) {
      if (!String(full_name).trim()) {
        return res.status(400).json({ error: 'full_name cannot be empty' });
      }
      updates.push('full_name = ?');
      params.push(full_name.trim());
    }

    if (email !== undefined) {
      if (!String(email).trim()) {
        return res.status(400).json({ error: 'email cannot be empty' });
      }
      const [dup] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [
        email.trim().toLowerCase(),
        req.params.id,
      ]);
      if (dup.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      updates.push('email = ?');
      params.push(email.trim().toLowerCase());
    }

    if (organization !== undefined) {
      updates.push('organization = ?');
      params.push(organization?.trim() || null);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone?.trim() || null);
    }

    if (sector !== undefined) {
      if (roleRequiresSector(user.role) && !String(sector).trim()) {
        return res.status(400).json({ error: 'sector is required for this role' });
      }
      updates.push('sector = ?');
      params.push(sector?.trim() || null);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = await getUserRowById(req.params.id);
    return res.json(formatPublicUser(updated));
  } catch (err) {
    console.error('Update user error:', err.message);
    return res.status(500).json({ error: 'Failed to update user' });
  }
}

async function changeRole(req, res) {
  try {
    const user = await getUserRowById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { role, sector, ministry_id } = req.body;
    if (!role) {
      return res.status(400).json({ error: 'role is required' });
    }

    const roleCheck = validateRoleAndSector(role, sector ?? user.sector);
    if (roleCheck.error) {
      return res.status(400).json({ error: roleCheck.error });
    }

    if (user.role === 'super_admin' && role !== 'super_admin') {
      const others = await countSuperAdmins(user.id);
      if (others === 0) {
        return res.status(400).json({ error: 'Cannot change role of the last super admin' });
      }
    }

    if (Number(req.params.id) === req.user.id && role !== 'super_admin') {
      return res.status(400).json({ error: 'Cannot remove your own super admin role' });
    }

    const newSector = roleRequiresSector(role)
      ? (sector?.trim() || user.sector?.trim() || null)
      : null;

    if (roleRequiresSector(role) && !newSector) {
      return res.status(400).json({ error: 'sector is required for this role' });
    }

    const { GLOBAL_USER_ROLES } = require('../utils/userHelpers');
    const { getMinistryById } = require('../utils/ministryScope');
    let newMinistryId = user.ministry_id;
    if (GLOBAL_USER_ROLES.has(role)) {
      newMinistryId = null;
    } else if (ministry_id !== undefined) {
      newMinistryId = Number(ministry_id);
      const ministry = await getMinistryById(newMinistryId);
      if (!ministry) {
        return res.status(400).json({ error: 'Invalid ministry_id' });
      }
    } else if (!newMinistryId) {
      return res.status(400).json({ error: 'ministry_id is required for this role' });
    }

    await pool.query('UPDATE users SET role = ?, sector = ?, ministry_id = ? WHERE id = ?', [
      role,
      newSector,
      newMinistryId,
      req.params.id,
    ]);

    const updated = await getUserRowById(req.params.id);
    return res.json(formatPublicUser(updated));
  } catch (err) {
    console.error('Change role error:', err.message);
    return res.status(500).json({ error: 'Failed to change role' });
  }
}

async function resetPassword(req, res) {
  try {
    const user = await getUserRowById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [
      hashedPassword,
      req.params.id,
    ]);

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
}

async function issuePartyBCredentials(req, res) {
  try {
    const user = await getUserRowById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'party_b') {
      return res.status(400).json({ error: 'Only Party B users can receive issued credentials' });
    }

    const result = await issueTemporaryCredentials(user);
    return res.json({
      ...result,
      user_id: user.id,
      full_name: user.full_name,
    });
  } catch (err) {
    console.error('Issue Party B credentials error:', err.message);
    return res.status(500).json({ error: 'Failed to issue credentials' });
  }
}

async function deleteUser(req, res) {
  try {
    const userId = Number(req.params.id);
    const unlinkReferences = parseUnlinkReferencesFlag(req.query.unlink_references);

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await getUserRowById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'super_admin') {
      const others = await countSuperAdmins(userId);
      if (others === 0) {
        return res.status(400).json({ error: 'Cannot delete the last super admin' });
      }
    }

    if (user.role === 'sector_lead') {
      const [[openComplaints]] = await pool.query(
        `SELECT COUNT(*) AS count FROM complaints
         WHERE tagged_sector_lead = ? AND status NOT IN ('resolved', 'rejected')`,
        [userId]
      );
      const [[openMmProposals]] = await pool.query(
        `SELECT COUNT(*) AS count FROM mm_proposals
         WHERE forwarded_to = ? AND status NOT IN ('matched', 'rejected')`,
        [userId]
      );
      const openComplaintCount = openComplaints.count;
      const openMmProposalCount = openMmProposals.count;
      if (openComplaintCount > 0 || openMmProposalCount > 0) {
        return res.status(400).json({
          error: 'Cannot delete Sector Lead with open assignments',
          open_complaints: openComplaintCount,
          open_mm_proposals: openMmProposalCount,
          message: 'Please reassign via /api/admin/sector-lead/reassign first',
        });
      }
    }

    const { stats, total, unlinkable, blocking } = await getUserReferences(userId);

    if (!unlinkReferences) {
      if (total > 0) {
        const payload = {
          error: 'Cannot delete user with existing portal records',
          references: stats,
        };
        if (unlinkable > 0 && blocking === 0) {
          payload.hint =
            'Retry with ?unlink_references=true to unlink Party B portal access from proposals and delete the account (proposals are kept)';
        }
        return res.status(400).json(payload);
      }

      await pool.query('DELETE FROM users WHERE id = ?', [userId]);
      return res.json({ message: 'User deleted successfully', id: userId });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const unlinked = await unlinkDeletableUserReferences(userId, connection);
      const afterUnlink = await getUserReferences(userId, connection);

      if (afterUnlink.blocking > 0) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Cannot delete user — remaining references cannot be unlinked automatically',
          references: afterUnlink.stats,
          unlinked,
          hint:
            'Party A proposals, matchmaking submissions, complaints, and activity history must be reassigned or retained',
        });
      }

      await connection.query('DELETE FROM users WHERE id = ?', [userId]);
      await connection.commit();

      return res.json({
        message: 'User deleted successfully — proposal records were kept, portal links removed',
        id: userId,
        unlinked,
      });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Delete user error:', err.message);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        error: 'Cannot delete user — still referenced by other records',
        hint: 'Try ?unlink_references=true for Party B accounts linked to proposals',
      });
    }
    return res.status(500).json({ error: 'Failed to delete user' });
  }
}

module.exports = {
  getSectorLeads,
  getRegionalFocalPoints,
  getRoles,
  getUserTabs,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeRole,
  resetPassword,
  issuePartyBCredentials,
  deleteUser,
};

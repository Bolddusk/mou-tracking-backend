const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { issueTemporaryCredentials } = require('../utils/partyBCredentials');
const {
  VALID_ROLES,
  ROLE_LABELS,
  formatPublicUser,
  isValidRole,
  roleRequiresSector,
} = require('../utils/userHelpers');

const USER_SELECT = `
  SELECT id, full_name, email, role, sector, organization, phone, created_at
  FROM users
`;

async function getUserRowById(userId) {
  const [rows] = await pool.query(`${USER_SELECT} WHERE id = ?`, [userId]);
  return rows[0] || null;
}

async function getUserStats(userId) {
  const [[proposalsFiled]] = await pool.query(
    'SELECT COUNT(*) AS count FROM proposals WHERE party_a_id = ?',
    [userId]
  );
  const [[proposalsReviewed]] = await pool.query(
    'SELECT COUNT(*) AS count FROM proposals WHERE reviewed_by = ?',
    [userId]
  );
  const [[complaintsFiled]] = await pool.query(
    'SELECT COUNT(*) AS count FROM complaints WHERE filed_by = ?',
    [userId]
  );
  const [[complaintsTagged]] = await pool.query(
    'SELECT COUNT(*) AS count FROM complaints WHERE tagged_sector_lead = ?',
    [userId]
  );
  const [[complaintsForwarded]] = await pool.query(
    'SELECT COUNT(*) AS count FROM complaints WHERE forwarded_to = ?',
    [userId]
  );
  const [[activitiesAdded]] = await pool.query(
    'SELECT COUNT(*) AS count FROM proposal_activities WHERE added_by = ?',
    [userId]
  );

  return {
    proposals_filed: proposalsFiled.count,
    proposals_reviewed: proposalsReviewed.count,
    complaints_filed: complaintsFiled.count,
    complaints_tagged: complaintsTagged.count,
    complaints_forwarded: complaintsForwarded.count,
    activities_added: activitiesAdded.count,
  };
}

async function getUserReferences(userId) {
  const stats = await getUserStats(userId);
  const total =
    stats.proposals_filed +
    stats.proposals_reviewed +
    stats.complaints_filed +
    stats.complaints_tagged +
    stats.complaints_forwarded +
    stats.activities_added;

  return { stats, total };
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
    return { error: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` };
  }
  if (roleRequiresSector(role) && !sector?.trim()) {
    return { error: 'sector is required for sector_lead and regional_focal_point' };
  }
  return { ok: true };
}

async function getSectorLeads(req, res) {
  try {
    let query = `SELECT id, full_name, email, sector
       FROM users
       WHERE role = 'sector_lead'`;
    const params = [];

    if (req.query.sector) {
      query += ' AND sector = ?';
      params.push(req.query.sector);
    }

    query += ' ORDER BY sector ASC, full_name ASC';

    const [rows] = await pool.query(query, params);
    return res.json(rows);
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
  return res.json(
    VALID_ROLES.map((role) => ({
      value: role,
      label: ROLE_LABELS[role] || role,
      requires_sector: roleRequiresSector(role),
    }))
  );
}

async function listUsers(req, res) {
  try {
    const { role, search } = req.query;
    const conditions = [];
    const params = [];

    if (role) {
      if (!isValidRole(role)) {
        return res.status(400).json({ error: 'Invalid role filter' });
      }
      conditions.push('role = ?');
      params.push(role);
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

    return res.json(rows.map(formatPublicUser));
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
    const { full_name, email, password, role, sector, organization, phone } = req.body;

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

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password, role, sector, organization, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        role,
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

    const { role, sector } = req.body;
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

    await pool.query('UPDATE users SET role = ?, sector = ? WHERE id = ?', [
      role,
      newSector,
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

    const { stats, total } = await getUserReferences(userId);
    if (total > 0) {
      return res.status(400).json({
        error: 'Cannot delete user with existing portal records',
        references: stats,
      });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    return res.json({ message: 'User deleted successfully', id: userId });
  } catch (err) {
    console.error('Delete user error:', err.message);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        error: 'Cannot delete user — still referenced by other records',
      });
    }
    return res.status(500).json({ error: 'Failed to delete user' });
  }
}

module.exports = {
  getSectorLeads,
  getRegionalFocalPoints,
  getRoles,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeRole,
  resetPassword,
  issuePartyBCredentials,
  deleteUser,
};

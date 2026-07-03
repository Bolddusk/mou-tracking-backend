const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { ROLE_LABELS } = require('../utils/userHelpers');
const { buildRbacPayload } = require('../utils/rolePermissions');
const { attachSectorLeadSectors } = require('../utils/sectorLeadAssignments');

const FALLBACK_REDIRECT_BY_ROLE = {
  party_a: '/dashboard/party-a',
  party_b: '/dashboard/party-b',
  sector_lead: '/dashboard/sector-lead',
  super_admin: '/dashboard/super-admin',
  admin: '/dashboard/admin',
  regional_focal_point: '/dashboard/regional-focal',
  focal_point: '/dashboard/focal-point',
  investor: '/dashboard/investor',
};

const USER_SELECT =
  'id, full_name, email, password, role, sector, country, organization, phone, must_change_password, created_at';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      sector: user.sector || null,
      country: user.country || null,
      full_name: user.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(user) {
  const base = {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    role_label: ROLE_LABELS[user.role] || user.role,
    sector: user.sector || null,
    country: user.country || null,
    organization: user.organization,
    phone: user.phone,
    must_change_password: Boolean(user.must_change_password),
    created_at: user.created_at || null,
  };

  if (user.role === 'sector_lead') {
    base.assigned_sectors = user.assigned_sectors || (user.sector ? [user.sector] : []);
    base.primary_sector = user.primary_sector || user.sector || null;
  }

  return base;
}

function resolveRedirect(user, rbac) {
  if (user.must_change_password) {
    return '/auth/change-password';
  }
  return rbac?.redirect || FALLBACK_REDIRECT_BY_ROLE[user.role] || null;
}

async function authResponse(user) {
  const enriched = await attachSectorLeadSectors(user);
  const rbac = await buildRbacPayload(enriched);
  return {
    token: signToken(enriched),
    user: publicUser(enriched),
    redirect: resolveRedirect(enriched, rbac),
    rbac,
  };
}

async function register(req, res) {
  try {
    const { full_name, email, password, organization, phone } = req.body;
    const role = 'party_a';

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password, role, organization, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [full_name, email, hashedPassword, role, organization, phone]
    );

    const user = {
      id: result.insertId,
      full_name,
      email,
      role,
      sector: null,
      country: null,
      organization,
      phone,
      must_change_password: 0,
    };

    return res.status(201).json(await authResponse(user));
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query(`SELECT ${USER_SELECT} FROM users WHERE email = ?`, [email]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json(await authResponse(user));
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
}

async function getMe(req, res) {
  try {
    const [rows] = await pool.query(`SELECT ${USER_SELECT} FROM users WHERE id = ?`, [
      req.user.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    const enriched = await attachSectorLeadSectors(user);
    const rbac = await buildRbacPayload(enriched);
    return res.json({
      user: publicUser(enriched),
      redirect: resolveRedirect(enriched, rbac),
      rbac,
    });
  } catch (err) {
    console.error('Get me error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

async function updateMe(req, res) {
  try {
    const [rows] = await pool.query(`SELECT ${USER_SELECT} FROM users WHERE id = ?`, [
      req.user.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    const { full_name, email, organization, phone } = req.body;
    const updates = [];
    const params = [];
    let emailChanged = false;

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
      const normalized = email.trim().toLowerCase();
      const [dup] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [
        normalized,
        req.user.id,
      ]);
      if (dup.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      updates.push('email = ?');
      params.push(normalized);
      emailChanged = normalized !== user.email;
    }

    if (organization !== undefined) {
      updates.push('organization = ?');
      params.push(organization?.trim() || null);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone?.trim() || null);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.user.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const [updatedRows] = await pool.query(`SELECT ${USER_SELECT} FROM users WHERE id = ?`, [
      req.user.id,
    ]);
    const updated = updatedRows[0];
    const rbac = await buildRbacPayload(updated);

    const response = {
      message: 'Profile updated successfully',
      user: publicUser(updated),
      redirect: resolveRedirect(updated, rbac),
      rbac,
    };

    if (emailChanged) {
      response.token = signToken(updated);
    }

    return res.json(response);
  } catch (err) {
    console.error('Update me error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }

    if (String(new_password).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    if (current_password === new_password) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const [rows] = await pool.query(`SELECT ${USER_SELECT} FROM users WHERE id = ?`, [
      req.user.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(current_password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await pool.query(
      'UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    const updated = { ...user, must_change_password: 0 };
    const rbac = await buildRbacPayload(updated);

    return res.json({
      message: 'Password changed successfully',
      token: signToken(updated),
      user: publicUser(updated),
      redirect: resolveRedirect(updated, rbac),
      rbac,
    });
  } catch (err) {
    console.error('Change password error:', err.message);
    return res.status(500).json({ error: 'Failed to change password' });
  }
}

module.exports = { register, login, getMe, updateMe, changePassword };

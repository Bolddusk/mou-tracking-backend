const pool = require('../config/db');
const {
  isSuperAdmin,
  isGlobalRole,
  formatMinistry,
} = require('../utils/ministryScope');

async function listMinistries(req, res) {
  try {
    const includeInactive =
      isSuperAdmin(req.user) &&
      (req.query.all === '1' || req.query.all === 'true');

    // SA / PA: all ministries. Scoped roles (sector_lead, admin, party_a, …): own only.
    if (!isGlobalRole(req.user)) {
      if (!req.user?.ministry_id) {
        return res.json({ data: [], total: 0 });
      }
      const [rows] = await pool.query(
        `SELECT id, code, name, is_active, created_at, updated_at
         FROM ministries
         WHERE id = ?
         ORDER BY name ASC`,
        [Number(req.user.ministry_id)]
      );
      return res.json({
        data: rows.map(formatMinistry),
        total: rows.length,
      });
    }

    const [rows] = await pool.query(
      `SELECT id, code, name, is_active, created_at, updated_at
       FROM ministries
       ${includeInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY name ASC`
    );

    return res.json({
      data: rows.map(formatMinistry),
      total: rows.length,
    });
  } catch (err) {
    console.error('List ministries error:', err.message);
    return res.status(500).json({ error: 'Failed to list ministries' });
  }
}

async function getMinistry(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, is_active, created_at, updated_at FROM ministries WHERE id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Ministry not found' });

    if (!isGlobalRole(req.user) && Number(rows[0].id) !== Number(req.user?.ministry_id)) {
      return res.status(403).json({ error: 'Access denied — outside your ministry' });
    }

    return res.json(formatMinistry(rows[0]));
  } catch (err) {
    console.error('Get ministry error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch ministry' });
  }
}

async function createMinistry(req, res) {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only Super Admin can create ministries' });
    }

    const code = String(req.body.code || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
    const name = String(req.body.name || '').trim();
    if (!code || !name) {
      return res.status(400).json({ error: 'code and name are required' });
    }

    const [dup] = await pool.query(`SELECT id FROM ministries WHERE code = ?`, [code]);
    if (dup.length) {
      return res.status(409).json({ error: 'Ministry code already exists' });
    }

    const [result] = await pool.query(
      `INSERT INTO ministries (code, name, is_active) VALUES (?, ?, 1)`,
      [code, name]
    );
    const [rows] = await pool.query(
      `SELECT id, code, name, is_active, created_at, updated_at FROM ministries WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json(formatMinistry(rows[0]));
  } catch (err) {
    console.error('Create ministry error:', err.message);
    return res.status(500).json({ error: 'Failed to create ministry' });
  }
}

async function updateMinistry(req, res) {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only Super Admin can update ministries' });
    }

    const [existing] = await pool.query(`SELECT * FROM ministries WHERE id = ?`, [
      req.params.id,
    ]);
    if (!existing[0]) return res.status(404).json({ error: 'Ministry not found' });

    const updates = [];
    const params = [];

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'name cannot be empty' });
      updates.push('name = ?');
      params.push(name);
    }

    if (req.body.code !== undefined) {
      const code = String(req.body.code)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      if (!code) return res.status(400).json({ error: 'code cannot be empty' });
      const [dup] = await pool.query(
        `SELECT id FROM ministries WHERE code = ? AND id != ?`,
        [code, req.params.id]
      );
      if (dup.length) return res.status(409).json({ error: 'Ministry code already exists' });
      updates.push('code = ?');
      params.push(code);
    }

    if (req.body.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(req.body.is_active ? 1 : 0);
    }

    if (!updates.length) {
      return res.json(formatMinistry(existing[0]));
    }

    params.push(req.params.id);
    await pool.query(`UPDATE ministries SET ${updates.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.query(
      `SELECT id, code, name, is_active, created_at, updated_at FROM ministries WHERE id = ?`,
      [req.params.id]
    );
    return res.json(formatMinistry(rows[0]));
  } catch (err) {
    console.error('Update ministry error:', err.message);
    return res.status(500).json({ error: 'Failed to update ministry' });
  }
}

async function deleteMinistry(req, res) {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only Super Admin can delete ministries' });
    }

    const [existing] = await pool.query(`SELECT * FROM ministries WHERE id = ?`, [
      req.params.id,
    ]);
    if (!existing[0]) return res.status(404).json({ error: 'Ministry not found' });

    if (existing[0].code === 'mnfsr') {
      return res.status(400).json({ error: 'Cannot delete the default MNFSR ministry' });
    }

    const [[u]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM users WHERE ministry_id = ?`,
      [req.params.id]
    );
    const [[p]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM proposals WHERE ministry_id = ?`,
      [req.params.id]
    );
    const [[c]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM conferences WHERE ministry_id = ?`,
      [req.params.id]
    );

    if (Number(u.cnt) || Number(p.cnt) || Number(c.cnt)) {
      return res.status(400).json({
        error: 'Ministry is in use — deactivate it instead of deleting',
        usage: {
          users: Number(u.cnt),
          proposals: Number(p.cnt),
          conferences: Number(c.cnt),
        },
      });
    }

    await pool.query(`DELETE FROM ministries WHERE id = ?`, [req.params.id]);
    return res.json({ ok: true, deleted_id: Number(req.params.id) });
  } catch (err) {
    console.error('Delete ministry error:', err.message);
    return res.status(500).json({ error: 'Failed to delete ministry' });
  }
}

module.exports = {
  listMinistries,
  getMinistry,
  createMinistry,
  updateMinistry,
  deleteMinistry,
};

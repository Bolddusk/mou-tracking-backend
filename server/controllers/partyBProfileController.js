const pool = require('../config/db');
const { getPublicFileUrl } = require('../middleware/upload');
const {
  getActiveSectorNames,
  ALLOWED_DOC_TYPES,
  MANDATORY_DOC_TYPES,
  parseSectors,
  emptyProfile,
  formatProfileRow,
  formatDocumentRow,
  buildCompletion,
  pickProfileUpdates,
  hasValue,
} = require('../utils/partyBProfile');
const { ensureSectorCache } = require('../utils/sectorRegistry');
const {
  PARTY_B_ROLES,
  assertCanViewPartyBProfile,
  getPartyBUser,
} = require('../utils/partyBProfileAccess');

function formatUserSummary(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    organization: user.organization,
    phone: user.phone,
    country: user.country,
    role: user.role,
    created_at: user.created_at,
  };
}

async function ensureProfileRow(userId) {
  const [rows] = await pool.query('SELECT * FROM party_b_profiles WHERE user_id = ?', [userId]);
  if (rows.length) return rows[0];
  await pool.query('INSERT INTO party_b_profiles (user_id) VALUES (?)', [userId]);
  const [created] = await pool.query('SELECT * FROM party_b_profiles WHERE user_id = ?', [userId]);
  return created[0];
}

async function getDocuments(userId) {
  const [rows] = await pool.query(
    `SELECT id, user_id, doc_type, title, description, file_url, original_filename, uploaded_at
     FROM party_b_profile_documents
     WHERE user_id = ?
     ORDER BY doc_type ASC, uploaded_at DESC`,
    [userId]
  );
  return rows.map(formatDocumentRow);
}

async function buildProfileResponse(userId, options = {}) {
  await ensureSectorCache();
  const availableSectors = getActiveSectorNames();
  const [rows] = await pool.query('SELECT * FROM party_b_profiles WHERE user_id = ?', [userId]);
  const profile = formatProfileRow(rows[0]) || emptyProfile(userId);
  const documents = await getDocuments(userId);
  const completion = buildCompletion(profile, documents);

  const payload = {
    profile,
    documents,
    completion,
    available_sectors: availableSectors,
  };

  if (options.user) {
    payload.user = formatUserSummary(options.user);
  }
  if (options.read_only !== undefined) {
    payload.read_only = options.read_only;
  }

  return payload;
}

async function syncUserBasics(userId, profile) {
  const updates = [];
  const params = [];
  if (hasValue(profile.company_name)) {
    updates.push('organization = ?');
    params.push(profile.company_name.trim());
  }
  if (hasValue(profile.phone)) {
    updates.push('phone = ?');
    params.push(profile.phone.trim());
  }
  if (hasValue(profile.country)) {
    updates.push('country = ?');
    params.push(profile.country.trim());
  }
  if (!updates.length) return;
  params.push(userId);
  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
}

async function getOwnProfile(req, res) {
  try {
    await ensureProfileRow(req.user.id);
    const user = await getPartyBUser(req.user.id);
    if (!user) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const payload = await buildProfileResponse(req.user.id, {
      user,
      read_only: false,
    });
    return res.json(payload);
  } catch (err) {
    console.error('Get Party B profile error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

async function getProfileByUserId(req, res) {
  try {
    const access = await assertCanViewPartyBProfile(req.user, req.params.userId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const [profileRows] = await pool.query(
      'SELECT user_id FROM party_b_profiles WHERE user_id = ?',
      [access.user.id]
    );
    if (!profileRows.length) {
      await ensureProfileRow(access.user.id);
    }

    const payload = await buildProfileResponse(access.user.id, {
      user: access.user,
      read_only: access.read_only,
    });

    return res.json(payload);
  } catch (err) {
    console.error('Get Party B profile by user id error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

async function getPartyBProfileEntry(req, res) {
  if (['sector_lead', 'super_admin'].includes(req.user.role)) {
    return listPartyBProfiles(req, res);
  }
  if (PARTY_B_ROLES.has(req.user.role)) {
    return getOwnProfile(req, res);
  }
  return res.status(403).json({ error: 'Forbidden' });
}

async function listPartyBProfiles(req, res) {
  try {
    if (req.user.role === 'super_admin') {
      const [rows] = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.organization, u.phone, u.country,
                p.company_name, p.profile_complete, p.updated_at AS profile_updated_at
         FROM users u
         LEFT JOIN party_b_profiles p ON p.user_id = u.id
         WHERE u.role IN ('party_b', 'investor')
         ORDER BY u.full_name ASC`
      );
      return res.json({ profiles: rows, scope: 'all' });
    }

    if (req.user.role === 'sector_lead') {
      if (!req.user.sector) {
        return res.status(400).json({ error: 'Sector lead profile has no sector assigned' });
      }

      const sector = req.user.sector;
      const [rows] = await pool.query(
        `SELECT DISTINCT u.id, u.full_name, u.email, u.organization, u.phone, u.country,
                p.company_name, p.profile_complete, p.updated_at AS profile_updated_at
         FROM users u
         LEFT JOIN party_b_profiles p ON p.user_id = u.id
         WHERE u.role IN ('party_b', 'investor')
           AND (
             u.id IN (
               SELECT party_b_user_id FROM proposals
               WHERE sector = ? AND status != 'draft' AND party_b_user_id IS NOT NULL
             )
             OR u.id IN (
               SELECT submitted_by FROM mm_proposals
               WHERE sector = ? AND side = 'side_b' AND status != 'draft'
             )
           )
         ORDER BY u.full_name ASC`,
        [sector, sector]
      );
      return res.json({ profiles: rows, scope: 'sector', sector });
    }

    return res.status(403).json({ error: 'Forbidden' });
  } catch (err) {
    console.error('List Party B profiles error:', err.message);
    return res.status(500).json({ error: 'Failed to list profiles' });
  }
}

async function updateProfile(req, res) {
  try {
    if (!PARTY_B_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await ensureSectorCache();
    const allowedSectors = getActiveSectorNames();
    const updates = pickProfileUpdates(req.body);
    if (req.body.sectors !== undefined) {
      const parsed = parseSectors(req.body.sectors, allowedSectors);
      if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
      }
      updates.sectors = JSON.stringify(parsed.sectors);
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No profile fields provided to update' });
    }

    await ensureProfileRow(req.user.id);

    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ');
    const params = [...Object.values(updates), req.user.id];
    await pool.query(`UPDATE party_b_profiles SET ${setClause} WHERE user_id = ?`, params);

    const payload = await buildProfileResponse(req.user.id);
    await syncUserBasics(req.user.id, payload.profile);

    await pool.query('UPDATE party_b_profiles SET profile_complete = ? WHERE user_id = ?', [
      payload.completion.profile_complete ? 1 : 0,
      req.user.id,
    ]);
    payload.profile.profile_complete = payload.completion.profile_complete;

    return res.json({
      message: 'Profile updated',
      ...payload,
    });
  } catch (err) {
    console.error('Update Party B profile error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function uploadDocument(req, res) {
  try {
    if (!PARTY_B_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name: document' });
    }

    const docType = String(req.body.doc_type || '').trim();
    if (!ALLOWED_DOC_TYPES.has(docType)) {
      return res.status(400).json({
        error: 'doc_type must be business_license, registration_certificate, or other',
      });
    }

    const title = req.body.title?.trim() || null;
    const description = req.body.description?.trim() || null;

    if (docType === 'other' && !title) {
      return res.status(400).json({ error: 'title is required for other documents' });
    }

    await ensureProfileRow(req.user.id);

    const fileUrl = getPublicFileUrl(req, req.file.filename, 'profiles');

    if (MANDATORY_DOC_TYPES.has(docType)) {
      const [existing] = await pool.query(
        'SELECT id FROM party_b_profile_documents WHERE user_id = ? AND doc_type = ?',
        [req.user.id, docType]
      );
      if (existing.length) {
        await pool.query('DELETE FROM party_b_profile_documents WHERE id = ?', [existing[0].id]);
      }
    }

    const defaultTitle =
      docType === 'other'
        ? title
        : docType === 'business_license'
          ? 'Business License'
          : 'Company Registration Certificate';

    const [result] = await pool.query(
      `INSERT INTO party_b_profile_documents
        (user_id, doc_type, title, description, file_url, original_filename)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, docType, defaultTitle, description, fileUrl, req.file.originalname]
    );

    const payload = await buildProfileResponse(req.user.id);
    await pool.query('UPDATE party_b_profiles SET profile_complete = ? WHERE user_id = ?', [
      payload.completion.profile_complete ? 1 : 0,
      req.user.id,
    ]);
    payload.profile.profile_complete = payload.completion.profile_complete;

    const uploaded = payload.documents.find((d) => d.id === result.insertId);

    return res.status(201).json({
      message: 'Document uploaded',
      document: uploaded,
      ...payload,
    });
  } catch (err) {
    console.error('Party B profile document upload error:', err.message);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
}

async function deleteDocument(req, res) {
  try {
    if (!PARTY_B_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const docId = Number(req.params.id);
    if (!docId) {
      return res.status(400).json({ error: 'Invalid document id' });
    }

    const [rows] = await pool.query(
      'SELECT id, doc_type FROM party_b_profile_documents WHERE id = ? AND user_id = ?',
      [docId, req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (rows[0].doc_type !== 'other') {
      return res.status(400).json({
        error: 'Mandatory certificates cannot be deleted. Upload a new file to replace them.',
      });
    }

    await pool.query('DELETE FROM party_b_profile_documents WHERE id = ?', [docId]);

    const payload = await buildProfileResponse(req.user.id);
    await pool.query('UPDATE party_b_profiles SET profile_complete = ? WHERE user_id = ?', [
      payload.completion.profile_complete ? 1 : 0,
      req.user.id,
    ]);
    payload.profile.profile_complete = payload.completion.profile_complete;

    return res.json({
      message: 'Document deleted',
      ...payload,
    });
  } catch (err) {
    console.error('Delete Party B profile document error:', err.message);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
}

module.exports = {
  getOwnProfile,
  getProfileByUserId,
  getPartyBProfileEntry,
  listPartyBProfiles,
  updateProfile,
  uploadDocument,
  deleteDocument,
  buildProfileResponse,
  ensureProfileRow,
};

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
const { getSectorLeadScopedSectors } = require('../utils/sectorLeadAssignments');
const {
  PARTY_B_ROLES,
  assertCanViewPartyBProfile,
  assertCanEditPartyBProfile,
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
  if (options.can_edit !== undefined) {
    payload.can_edit = options.can_edit;
  } else if (options.read_only !== undefined) {
    payload.can_edit = !options.read_only;
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
      can_edit: true,
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
      can_edit: access.can_edit,
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
      const sectorScopes = getSectorLeadScopedSectors(req.user);
      if (!sectorScopes.length) {
        return res.status(400).json({ error: 'Sector lead profile has no sector assigned' });
      }

      const sectorPlaceholders = sectorScopes.map(() => '?').join(', ');
      const [rows] = await pool.query(
        `SELECT DISTINCT u.id, u.full_name, u.email, u.organization, u.phone, u.country,
                p.company_name, p.profile_complete, p.updated_at AS profile_updated_at
         FROM users u
         LEFT JOIN party_b_profiles p ON p.user_id = u.id
         WHERE u.role IN ('party_b', 'investor')
           AND (
             u.id IN (
               SELECT party_b_user_id FROM proposals
               WHERE sector IN (${sectorPlaceholders}) AND status != 'draft' AND party_b_user_id IS NOT NULL
             )
             OR u.id IN (
               SELECT submitted_by FROM mm_proposals
               WHERE sector IN (${sectorPlaceholders}) AND side = 'side_b' AND status != 'draft'
             )
           )
         ORDER BY u.full_name ASC`,
        [...sectorScopes, ...sectorScopes]
      );
      return res.json({
        profiles: rows,
        scope: 'sectors',
        sectors: sectorScopes,
        sector: sectorScopes.length === 1 ? sectorScopes[0] : null,
      });
    }

    return res.status(403).json({ error: 'Forbidden' });
  } catch (err) {
    console.error('List Party B profiles error:', err.message);
    return res.status(500).json({ error: 'Failed to list profiles' });
  }
}

async function applyProfileUpdate(targetUserId, body) {
  await ensureSectorCache();
  const allowedSectors = getActiveSectorNames();
  const updates = pickProfileUpdates(body);
  if (body.sectors !== undefined) {
    const parsed = parseSectors(body.sectors, allowedSectors);
    if (parsed.error) {
      return { error: parsed.error, status: 400 };
    }
    updates.sectors = JSON.stringify(parsed.sectors);
  }

  if (!Object.keys(updates).length) {
    return { error: 'No profile fields provided to update', status: 400 };
  }

  await ensureProfileRow(targetUserId);

  const setClause = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(', ');
  const params = [...Object.values(updates), targetUserId];
  await pool.query(`UPDATE party_b_profiles SET ${setClause} WHERE user_id = ?`, params);

  const payload = await buildProfileResponse(targetUserId);
  await syncUserBasics(targetUserId, payload.profile);

  await pool.query('UPDATE party_b_profiles SET profile_complete = ? WHERE user_id = ?', [
    payload.completion.profile_complete ? 1 : 0,
    targetUserId,
  ]);
  payload.profile.profile_complete = payload.completion.profile_complete;

  return { payload };
}

async function updateProfile(req, res) {
  try {
    if (!PARTY_B_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await applyProfileUpdate(req.user.id, req.body);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({
      message: 'Profile updated',
      ...result.payload,
      read_only: false,
      can_edit: true,
    });
  } catch (err) {
    console.error('Update Party B profile error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function updateProfileByUserId(req, res) {
  try {
    const access = await assertCanEditPartyBProfile(req.user, req.params.userId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const result = await applyProfileUpdate(access.user.id, req.body);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const user = await getPartyBUser(access.user.id);
    return res.json({
      message: 'Profile updated',
      ...result.payload,
      user: formatUserSummary(user),
      read_only: false,
      can_edit: true,
    });
  } catch (err) {
    console.error('Update Party B profile by user id error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function uploadDocumentForUser(targetUserId, req) {
  if (!req.file) {
    return { error: 'No file uploaded. Use field name: document', status: 400 };
  }

  const docType = String(req.body.doc_type || '').trim();
  if (!ALLOWED_DOC_TYPES.has(docType)) {
    return {
      error: 'doc_type must be business_license, registration_certificate, or other',
      status: 400,
    };
  }

  const title = req.body.title?.trim() || null;
  const description = req.body.description?.trim() || null;

  if (docType === 'other' && !title) {
    return { error: 'title is required for other documents', status: 400 };
  }

  await ensureProfileRow(targetUserId);

  const fileUrl = getPublicFileUrl(req, req.file.filename, 'profiles');

  if (MANDATORY_DOC_TYPES.has(docType)) {
    const [existing] = await pool.query(
      'SELECT id FROM party_b_profile_documents WHERE user_id = ? AND doc_type = ?',
      [targetUserId, docType]
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
    [targetUserId, docType, defaultTitle, description, fileUrl, req.file.originalname]
  );

  const payload = await buildProfileResponse(targetUserId);
  await pool.query('UPDATE party_b_profiles SET profile_complete = ? WHERE user_id = ?', [
    payload.completion.profile_complete ? 1 : 0,
    targetUserId,
  ]);
  payload.profile.profile_complete = payload.completion.profile_complete;

  const uploaded = payload.documents.find((d) => d.id === result.insertId);
  return { payload, uploaded };
}

async function uploadDocument(req, res) {
  try {
    if (!PARTY_B_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await uploadDocumentForUser(req.user.id, req);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(201).json({
      message: 'Document uploaded',
      document: result.uploaded,
      ...result.payload,
      read_only: false,
      can_edit: true,
    });
  } catch (err) {
    console.error('Party B profile document upload error:', err.message);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
}

async function uploadDocumentByUserId(req, res) {
  try {
    const access = await assertCanEditPartyBProfile(req.user, req.params.userId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const result = await uploadDocumentForUser(access.user.id, req);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const user = await getPartyBUser(access.user.id);
    return res.status(201).json({
      message: 'Document uploaded',
      document: result.uploaded,
      ...result.payload,
      user: formatUserSummary(user),
      read_only: false,
      can_edit: true,
    });
  } catch (err) {
    console.error('Party B profile document upload by user id error:', err.message);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
}

async function deleteDocumentForUser(targetUserId, docId) {
  if (!docId) {
    return { error: 'Invalid document id', status: 400 };
  }

  const [rows] = await pool.query(
    'SELECT id, doc_type FROM party_b_profile_documents WHERE id = ? AND user_id = ?',
    [docId, targetUserId]
  );
  if (!rows.length) {
    return { error: 'Document not found', status: 404 };
  }

  if (rows[0].doc_type !== 'other') {
    return {
      error: 'Mandatory certificates cannot be deleted. Upload a new file to replace them.',
      status: 400,
    };
  }

  await pool.query('DELETE FROM party_b_profile_documents WHERE id = ?', [docId]);

  const payload = await buildProfileResponse(targetUserId);
  await pool.query('UPDATE party_b_profiles SET profile_complete = ? WHERE user_id = ?', [
    payload.completion.profile_complete ? 1 : 0,
    targetUserId,
  ]);
  payload.profile.profile_complete = payload.completion.profile_complete;

  return { payload };
}

async function deleteDocument(req, res) {
  try {
    if (!PARTY_B_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await deleteDocumentForUser(req.user.id, Number(req.params.id));
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({
      message: 'Document deleted',
      ...result.payload,
      read_only: false,
      can_edit: true,
    });
  } catch (err) {
    console.error('Delete Party B profile document error:', err.message);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
}

async function deleteDocumentByUserId(req, res) {
  try {
    const access = await assertCanEditPartyBProfile(req.user, req.params.userId);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const result = await deleteDocumentForUser(access.user.id, Number(req.params.docId));
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const user = await getPartyBUser(access.user.id);
    return res.json({
      message: 'Document deleted',
      ...result.payload,
      user: formatUserSummary(user),
      read_only: false,
      can_edit: true,
    });
  } catch (err) {
    console.error('Delete Party B profile document by user id error:', err.message);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
}

module.exports = {
  getOwnProfile,
  getProfileByUserId,
  getPartyBProfileEntry,
  listPartyBProfiles,
  updateProfile,
  updateProfileByUserId,
  uploadDocument,
  uploadDocumentByUserId,
  deleteDocument,
  deleteDocumentByUserId,
  buildProfileResponse,
  ensureProfileRow,
};

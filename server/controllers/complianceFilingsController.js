const pool = require('../config/db');
const { getPublicFileUrl } = require('../middleware/upload');
const {
  FILING_TYPES,
  FILING_TYPE_LABELS,
  getRequiredFiscalYears,
  isRequiredFiscalYear,
  isAllowedFilingType,
  buildComplianceMatrix,
  summarizeCompliance,
} = require('../utils/complianceFilings');

const FILING_SELECT = `
  SELECT f.*,
    u.full_name AS user_name,
    u.email AS user_email,
    u.organization AS user_organization,
    up.full_name AS uploaded_by_name
  FROM compliance_filings f
  JOIN users u ON u.id = f.user_id
  JOIN users up ON up.id = f.uploaded_by
`;

function formatFilingRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    user_name: row.user_name,
    user_email: row.user_email,
    user_organization: row.user_organization,
    fiscal_year: Number(row.fiscal_year),
    filing_type: row.filing_type,
    filing_type_label: FILING_TYPE_LABELS[row.filing_type] || row.filing_type,
    file_url: row.file_url,
    original_filename: row.original_filename,
    notes: row.notes,
    uploaded_by: Number(row.uploaded_by),
    uploaded_by_name: row.uploaded_by_name,
    uploaded_at: row.uploaded_at,
    updated_at: row.updated_at,
  };
}

function buildMetaResponse(access) {
  const years = getRequiredFiscalYears();
  return {
    required_fiscal_years: years,
    filing_types: FILING_TYPES.map((key) => ({
      key,
      label: FILING_TYPE_LABELS[key],
    })),
    slots_per_organization: years.length * FILING_TYPES.length,
    access,
  };
}

function buildMatrixResponse(user, formatted) {
  const years = getRequiredFiscalYears();
  const userId = Number(user.id);
  const matrix = buildComplianceMatrix(formatted, userId);
  const uploaded_count = formatted.length;
  const required_slots = years.length * FILING_TYPES.length;

  return {
    user: {
      id: userId,
      full_name: user.full_name,
      email: user.email,
      organization: user.organization,
      country: user.country,
      role: user.role,
    },
    required_fiscal_years: years,
    required_slots,
    uploaded_count,
    missing_count: required_slots - uploaded_count,
    complete: uploaded_count === required_slots,
    matrix,
    filings: formatted,
  };
}

async function fetchUserMatrix(userId) {
  const years = getRequiredFiscalYears();
  const [users] = await pool.query(
    'SELECT id, full_name, email, organization, country, role FROM users WHERE id = ?',
    [userId]
  );
  const user = users[0];
  if (!user) return null;

  const [filings] = await pool.query(
    `${FILING_SELECT}
     WHERE f.user_id = ? AND f.fiscal_year IN (?, ?, ?)
     ORDER BY f.fiscal_year DESC, f.filing_type ASC`,
    [userId, ...years]
  );

  return buildMatrixResponse(user, filings.map(formatFilingRow));
}

async function assertPartyAUser(userId) {
  const [users] = await pool.query('SELECT id, role FROM users WHERE id = ?', [userId]);
  if (!users[0]) {
    return { error: 'User not found', status: 404 };
  }
  if (users[0].role !== 'party_a') {
    return {
      error: 'Compliance filings are currently linked to party_a organizations only',
      status: 400,
    };
  }
  return { ok: true };
}

async function upsertFiling({ userId, fiscalYear, filingType, notes, req, file, uploadedBy }) {
  const fileUrl = getPublicFileUrl(req, file.filename, 'compliance');

  const [existing] = await pool.query(
    `SELECT id FROM compliance_filings
     WHERE user_id = ? AND fiscal_year = ? AND filing_type = ?`,
    [userId, fiscalYear, filingType]
  );

  let filingId;
  const replaced = existing.length > 0;
  if (replaced) {
    filingId = existing[0].id;
    await pool.query(
      `UPDATE compliance_filings
       SET file_url = ?, original_filename = ?, notes = ?, uploaded_by = ?
       WHERE id = ?`,
      [fileUrl, file.originalname, notes, uploadedBy, filingId]
    );
  } else {
    const [result] = await pool.query(
      `INSERT INTO compliance_filings
        (user_id, fiscal_year, filing_type, file_url, original_filename, notes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, fiscalYear, filingType, fileUrl, file.originalname, notes, uploadedBy]
    );
    filingId = result.insertId;
  }

  const [rows] = await pool.query(`${FILING_SELECT} WHERE f.id = ?`, [filingId]);
  return { replaced, filing: formatFilingRow(rows[0]) };
}

function parseUploadFields(body) {
  return {
    fiscalYear: Number(body.fiscal_year),
    filingType: String(body.filing_type || '').trim(),
    notes: body.notes?.trim() || null,
  };
}

function validateUploadFields({ fiscalYear, filingType }) {
  if (!fiscalYear) {
    return { error: 'fiscal_year is required' };
  }
  if (!isAllowedFilingType(filingType)) {
    return { error: 'filing_type must be audit_report or annual_return' };
  }
  if (!isRequiredFiscalYear(fiscalYear)) {
    return {
      error: `fiscal_year must be one of: ${getRequiredFiscalYears().join(', ')}`,
    };
  }
  return { ok: true };
}

function tableMissingResponse(res, err) {
  if (err.code === 'ER_NO_SUCH_TABLE') {
    return res.status(503).json({
      error: 'Compliance filings table not found. Run: npm run db:migrate:compliance-filings',
    });
  }
  return null;
}

// --- Super Admin ---

async function getMeta(req, res) {
  try {
    return res.json(buildMetaResponse('super_admin'));
  } catch (err) {
    console.error('Compliance meta error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch compliance metadata' });
  }
}

async function listFilings(req, res) {
  try {
    let query = `${FILING_SELECT} WHERE 1=1`;
    const params = [];

    const userId = Number(req.query.user_id);
    if (userId) {
      query += ' AND f.user_id = ?';
      params.push(userId);
    }

    const fiscalYear = Number(req.query.fiscal_year);
    if (fiscalYear) {
      query += ' AND f.fiscal_year = ?';
      params.push(fiscalYear);
    }

    const filingType = String(req.query.filing_type || '').trim();
    if (filingType) {
      if (!isAllowedFilingType(filingType)) {
        return res.status(400).json({ error: 'Invalid filing_type' });
      }
      query += ' AND f.filing_type = ?';
      params.push(filingType);
    }

    query += ' ORDER BY f.user_id ASC, f.fiscal_year DESC, f.filing_type ASC';

    const [rows] = await pool.query(query, params);
    return res.json({
      filings: rows.map(formatFilingRow),
      count: rows.length,
      required_fiscal_years: getRequiredFiscalYears(),
    });
  } catch (err) {
    console.error('Compliance list error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch compliance filings' });
  }
}

async function getOverview(req, res) {
  try {
    const [users] = await pool.query(
      `SELECT id, full_name, email, organization, country
       FROM users
       WHERE role = 'party_a'
       ORDER BY full_name ASC`
    );

    const [filings] = await pool.query(
      `SELECT user_id, fiscal_year, filing_type
       FROM compliance_filings
       WHERE fiscal_year IN (?, ?, ?)`,
      getRequiredFiscalYears()
    );

    const organizations = summarizeCompliance(filings, users);
    const complete = organizations.filter((o) => o.complete).length;

    return res.json({
      required_fiscal_years: getRequiredFiscalYears(),
      filing_types: FILING_TYPES,
      total_organizations: organizations.length,
      complete_organizations: complete,
      incomplete_organizations: organizations.length - complete,
      organizations,
    });
  } catch (err) {
    console.error('Compliance overview error:', err.message);
    const missing = tableMissingResponse(res, err);
    if (missing) return missing;
    return res.status(500).json({ error: 'Failed to fetch compliance overview' });
  }
}

async function getUserMatrix(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const data = await fetchUserMatrix(userId);
    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(data);
  } catch (err) {
    console.error('Compliance matrix error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch compliance matrix' });
  }
}

async function uploadFiling(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name: document' });
    }

    const userId = Number(req.body.user_id);
    const fields = parseUploadFields(req.body);
    const validation = validateUploadFields(fields);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }
    if (!userId) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const partyCheck = await assertPartyAUser(userId);
    if (partyCheck.error) {
      return res.status(partyCheck.status).json({ error: partyCheck.error });
    }

    const { replaced, filing } = await upsertFiling({
      userId,
      fiscalYear: fields.fiscalYear,
      filingType: fields.filingType,
      notes: fields.notes,
      req,
      file: req.file,
      uploadedBy: req.user.id,
    });

    return res.status(replaced ? 200 : 201).json({
      message: replaced ? 'Filing replaced' : 'Filing uploaded',
      filing,
    });
  } catch (err) {
    console.error('Compliance upload error:', err.message);
    const missing = tableMissingResponse(res, err);
    if (missing) return missing;
    return res.status(500).json({ error: 'Failed to upload compliance filing' });
  }
}

async function deleteFiling(req, res) {
  try {
    const filingId = Number(req.params.id);
    const [rows] = await pool.query('SELECT id FROM compliance_filings WHERE id = ?', [filingId]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Filing not found' });
    }

    await pool.query('DELETE FROM compliance_filings WHERE id = ?', [filingId]);
    return res.json({ message: 'Filing deleted', id: filingId });
  } catch (err) {
    console.error('Compliance delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete compliance filing' });
  }
}

// --- Party A self-service ---

async function getMyMeta(req, res) {
  try {
    if (req.user.role !== 'party_a') {
      return res.status(403).json({ error: 'Only Party A can manage own compliance filings' });
    }
    return res.json(buildMetaResponse('party_a_self'));
  } catch (err) {
    console.error('Compliance my meta error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch compliance metadata' });
  }
}

async function getMyMatrix(req, res) {
  try {
    if (req.user.role !== 'party_a') {
      return res.status(403).json({ error: 'Only Party A can view own compliance filings' });
    }

    const data = await fetchUserMatrix(req.user.id);
    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(data);
  } catch (err) {
    console.error('Compliance my matrix error:', err.message);
    const missing = tableMissingResponse(res, err);
    if (missing) return missing;
    return res.status(500).json({ error: 'Failed to fetch compliance matrix' });
  }
}

async function uploadMyFiling(req, res) {
  try {
    if (req.user.role !== 'party_a') {
      return res.status(403).json({ error: 'Only Party A can upload compliance filings' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name: document' });
    }

    const fields = parseUploadFields(req.body);
    const validation = validateUploadFields(fields);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const { replaced, filing } = await upsertFiling({
      userId: req.user.id,
      fiscalYear: fields.fiscalYear,
      filingType: fields.filingType,
      notes: fields.notes,
      req,
      file: req.file,
      uploadedBy: req.user.id,
    });

    return res.status(replaced ? 200 : 201).json({
      message: replaced ? 'Filing replaced' : 'Filing uploaded',
      filing,
    });
  } catch (err) {
    console.error('Compliance my upload error:', err.message);
    const missing = tableMissingResponse(res, err);
    if (missing) return missing;
    return res.status(500).json({ error: 'Failed to upload compliance filing' });
  }
}

async function deleteMyFiling(req, res) {
  try {
    if (req.user.role !== 'party_a') {
      return res.status(403).json({ error: 'Only Party A can delete own compliance filings' });
    }

    const filingId = Number(req.params.id);
    const [rows] = await pool.query(
      'SELECT id, user_id FROM compliance_filings WHERE id = ?',
      [filingId]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'Filing not found' });
    }
    if (Number(rows[0].user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM compliance_filings WHERE id = ?', [filingId]);
    return res.json({ message: 'Filing deleted', id: filingId });
  } catch (err) {
    console.error('Compliance my delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete compliance filing' });
  }
}

module.exports = {
  getMeta,
  listFilings,
  getOverview,
  getUserMatrix,
  uploadFiling,
  deleteFiling,
  getMyMeta,
  getMyMatrix,
  uploadMyFiling,
  deleteMyFiling,
};

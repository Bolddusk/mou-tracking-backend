const { getActiveSectorNames } = require('./sectorRegistry');

const MANDATORY_DOC_TYPES = new Set(['business_license', 'registration_certificate']);
const ALLOWED_DOC_TYPES = new Set(['business_license', 'registration_certificate', 'other']);

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function parseSectors(input, allowedSectors = getActiveSectorNames()) {
  if (input === undefined || input === null) return undefined;
  let list = input;
  if (typeof input === 'string') {
    try {
      list = JSON.parse(input);
    } catch {
      list = input.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(list)) {
    return { error: 'sectors must be an array of sector names' };
  }
  const invalid = list.filter((s) => !allowedSectors.includes(s));
  if (invalid.length) {
    return { error: `Invalid sector(s): ${invalid.join(', ')}` };
  }
  return { sectors: [...new Set(list)] };
}

function emptyProfile(userId) {
  return {
    user_id: userId,
    company_name: null,
    registration_number: null,
    country: 'China',
    address: null,
    phone: null,
    website: null,
    tax_id: null,
    company_reg_number: null,
    company_description: null,
    sectors: [],
    hs_codes: null,
    business_license_issue_date: null,
    business_license_authority: null,
    company_reg_date: null,
    profile_complete: false,
    created_at: null,
    updated_at: null,
  };
}

function formatProfileRow(row) {
  if (!row) return null;
  let sectors = [];
  if (row.sectors) {
    sectors = typeof row.sectors === 'string' ? JSON.parse(row.sectors) : row.sectors;
  }
  return {
    user_id: row.user_id,
    company_name: row.company_name,
    registration_number: row.registration_number,
    country: row.country || 'China',
    address: row.address,
    phone: row.phone,
    website: row.website,
    tax_id: row.tax_id,
    company_reg_number: row.company_reg_number,
    company_description: row.company_description,
    sectors,
    hs_codes: row.hs_codes,
    business_license_issue_date: row.business_license_issue_date,
    business_license_authority: row.business_license_authority,
    company_reg_date: row.company_reg_date,
    profile_complete: Boolean(row.profile_complete),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function formatDocumentRow(row) {
  return {
    id: row.id,
    doc_type: row.doc_type,
    title: row.title,
    description: row.description,
    file_url: row.file_url,
    original_filename: row.original_filename,
    uploaded_at: row.uploaded_at,
  };
}

function groupDocuments(documents) {
  const grouped = {
    business_license: null,
    registration_certificate: null,
    other: [],
  };
  documents.forEach((doc) => {
    if (doc.doc_type === 'other') {
      grouped.other.push(doc);
    } else {
      grouped[doc.doc_type] = doc;
    }
  });
  return grouped;
}

function buildCompletion(profile, documents) {
  const grouped = groupDocuments(documents);
  const checks = [
    { key: 'company_name', label: 'Company Name', met: hasValue(profile.company_name) },
    { key: 'company_description', label: 'Company Description', met: hasValue(profile.company_description) },
    { key: 'sectors', label: 'At least one Sector', met: profile.sectors?.length > 0 },
    { key: 'address', label: 'Address', met: hasValue(profile.address) },
    { key: 'phone', label: 'Phone Number', met: hasValue(profile.phone) },
    { key: 'country', label: 'Country', met: hasValue(profile.country) },
    {
      key: 'tax_id',
      label: 'Tax Registration Number',
      met: hasValue(profile.tax_id),
    },
    {
      key: 'business_license',
      label: 'Business License',
      met: Boolean(grouped.business_license),
    },
    {
      key: 'company_reg_number',
      label: 'Company Registration Number',
      met: hasValue(profile.company_reg_number),
    },
    {
      key: 'registration_certificate',
      label: 'Company Registration Certificate',
      met: Boolean(grouped.registration_certificate),
    },
  ];

  const metCount = checks.filter((c) => c.met).length;
  const total = checks.length;
  const completion_pct = Math.round((metCount / total) * 100);
  const missing_fields = checks.filter((c) => !c.met).map((c) => c.label);

  return {
    completion_pct,
    profile_complete: metCount === total,
    checks,
    missing_fields,
    mandatory_documents: {
      business_license: grouped.business_license,
      registration_certificate: grouped.registration_certificate,
    },
    other_documents: grouped.other,
  };
}

function pickProfileUpdates(body) {
  const allowed = [
    'company_name',
    'registration_number',
    'country',
    'address',
    'phone',
    'website',
    'tax_id',
    'company_reg_number',
    'company_description',
    'hs_codes',
    'business_license_issue_date',
    'business_license_authority',
    'company_reg_date',
  ];
  const updates = {};
  allowed.forEach((key) => {
    if (body[key] !== undefined) {
      updates[key] = body[key] === '' ? null : body[key];
    }
  });
  return updates;
}

module.exports = {
  getActiveSectorNames,
  MANDATORY_DOC_TYPES,
  ALLOWED_DOC_TYPES,
  hasValue,
  parseSectors,
  emptyProfile,
  formatProfileRow,
  formatDocumentRow,
  groupDocuments,
  buildCompletion,
  pickProfileUpdates,
};

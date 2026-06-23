const { SECTORS } = require('../constants/sectors');

const MANDATORY_DOC_TYPES = new Set(['fbr_certificate', 'secp_certificate']);
const ALLOWED_DOC_TYPES = new Set(['fbr_certificate', 'secp_certificate', 'other']);

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function parseSectors(input) {
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
  const invalid = list.filter((s) => !SECTORS.includes(s));
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
    address: null,
    phone: null,
    website: null,
    tax_id: null,
    secp_number: null,
    psw_id: null,
    company_description: null,
    sectors: [],
    hs_codes: null,
    fbr_certificate_issue_date: null,
    fbr_tax_office: null,
    secp_incorporation_date: null,
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
    address: row.address,
    phone: row.phone,
    website: row.website,
    tax_id: row.tax_id,
    secp_number: row.secp_number,
    psw_id: row.psw_id,
    company_description: row.company_description,
    sectors,
    hs_codes: row.hs_codes,
    fbr_certificate_issue_date: row.fbr_certificate_issue_date,
    fbr_tax_office: row.fbr_tax_office,
    secp_incorporation_date: row.secp_incorporation_date,
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
    fbr_certificate: null,
    secp_certificate: null,
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
    {
      key: 'tax_id',
      label: 'FBR Tax ID (NTN)',
      met: hasValue(profile.tax_id),
    },
    {
      key: 'fbr_certificate',
      label: 'FBR Taxpayer Registration Certificate',
      met: Boolean(grouped.fbr_certificate),
    },
    {
      key: 'secp_number',
      label: 'SECP Incorporation Number',
      met: hasValue(profile.secp_number),
    },
    {
      key: 'secp_certificate',
      label: 'SECP Certificate of Incorporation',
      met: Boolean(grouped.secp_certificate),
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
      fbr_certificate: grouped.fbr_certificate,
      secp_certificate: grouped.secp_certificate,
    },
    other_documents: grouped.other,
  };
}

function pickProfileUpdates(body) {
  const allowed = [
    'company_name',
    'registration_number',
    'address',
    'phone',
    'website',
    'tax_id',
    'secp_number',
    'psw_id',
    'company_description',
    'hs_codes',
    'fbr_certificate_issue_date',
    'fbr_tax_office',
    'secp_incorporation_date',
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
  SECTORS,
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

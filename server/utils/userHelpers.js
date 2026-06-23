const VALID_ROLES = [
  'super_admin',
  'admin',
  'sector_lead',
  'regional_focal_point',
  'focal_point',
  'party_a',
  'party_b',
  'investor',
];

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  sector_lead: 'Sector Lead',
  regional_focal_point: 'Regional Focal Point',
  focal_point: 'Focal Point',
  party_a: 'Party A',
  party_b: 'Party B',
  investor: 'Investor',
};

const SECTOR_ROLES = new Set(['sector_lead', 'regional_focal_point', 'focal_point']);

function formatPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    role_label: ROLE_LABELS[row.role] || row.role,
    sector: row.sector || null,
    organization: row.organization || null,
    phone: row.phone || null,
    created_at: row.created_at,
  };
}

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function roleRequiresSector(role) {
  return SECTOR_ROLES.has(role);
}

module.exports = {
  VALID_ROLES,
  ROLE_LABELS,
  SECTOR_ROLES,
  formatPublicUser,
  isValidRole,
  roleRequiresSector,
};

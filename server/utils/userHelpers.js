const VALID_ROLES = [
  'super_admin',
  'admin',
  'power_admin',
  'sector_lead',
  'party_a',
  'party_b',
];

/** Removed from user management UI — still may exist in DB historically */
const DEPRECATED_ROLES = [
  'investor',
  'focal_point',
  'regional_focal_point',
];

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  power_admin: 'Power Admin',
  sector_lead: 'Sector Lead',
  party_a: 'Party A',
  party_b: 'Party B',
  regional_focal_point: 'Regional Focal Point',
  focal_point: 'Focal Point',
  investor: 'Investor',
};

const USER_TABS = [
  {
    key: 'party_a',
    label: 'Party A',
    roles: ['party_a'],
  },
  {
    key: 'party_b',
    label: 'Party B',
    roles: ['party_b', 'investor'],
  },
  {
    key: 'sector_lead',
    label: 'Sector Leads',
    roles: ['sector_lead'],
  },
  {
    key: 'admins',
    label: 'Admins',
    roles: ['super_admin', 'admin', 'power_admin'],
  },
];

const SECTOR_ROLES = new Set(['sector_lead']);
const GLOBAL_USER_ROLES = new Set(['super_admin', 'power_admin']);

function formatPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    role_label: ROLE_LABELS[row.role] || row.role,
    ministry_id: row.ministry_id ?? null,
    sector: row.sector || null,
    organization: row.organization || null,
    phone: row.phone || null,
    created_at: row.created_at,
  };
}

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function isDeprecatedRole(role) {
  return DEPRECATED_ROLES.includes(role);
}

function roleRequiresSector(role) {
  return SECTOR_ROLES.has(role);
}

function getTabByKey(tabKey) {
  if (!tabKey) return null;
  return USER_TABS.find((t) => t.key === String(tabKey).trim()) || null;
}

module.exports = {
  VALID_ROLES,
  DEPRECATED_ROLES,
  ROLE_LABELS,
  USER_TABS,
  SECTOR_ROLES,
  GLOBAL_USER_ROLES,
  formatPublicUser,
  isValidRole,
  isDeprecatedRole,
  roleRequiresSector,
  getTabByKey,
};

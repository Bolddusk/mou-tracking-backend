const { VALID_ROLES, ROLE_LABELS } = require('./userHelpers');
const {
  SIDEBAR_NAV_KEYS,
  NAV_CATALOG,
  NAV_ROUTE_BY_PERMISSION,
  resolveNavPath,
  normalizeNavPath,
} = require('./navCatalog');

/** Obsolete nav keys — stripped from DB + API responses. */
const OBSOLETE_NAV_KEYS = [
  'nav.mous.all',
  'nav.mous.sector',
  'nav.proposals.my',
  'nav.proposals.party_b',
  'nav.proposals.new',
  'nav.matchmaking.all_proposals',
  'nav.matchmaking.matches',
  'nav.complaints.mine',
  'nav.complaints.own',
  'nav.complaints.sector',
  'nav.profiles.party_a',
  'nav.profiles.party_b',
  'nav.profile.party_a',
  'nav.profile.party_b',
  'nav.profile.party_a_list',
  'nav.profile.party_b_list',
];

/** Legacy DB nav keys → one of the 15 sidebar keys (migration only). */
const PERMISSION_ALIASES = {
  'nav.proposals.new': 'nav.proposals.new_direct',
  'nav.complaints.own': 'nav.complaints.all',
  'nav.complaints.mine': 'nav.complaints.all',
  'nav.complaints.sector': 'nav.complaints.all',
  'nav.matchmaking.matches': 'nav.matchmaking.all_matches',
  'nav.mous.all': 'nav.opportunities.all',
  'proposals.view_detail': 'proposals.view',
  'proposals.view_own': 'proposals.view',
};

/** admin.* action keys satisfy matching nav catalog entries. */
const ADMIN_NAV_GRANTS = {
  'nav.permissions.manage': ['admin.rbac'],
  'nav.sectors.manage': ['admin.sectors'],
  'nav.compliance.audit': ['admin.compliance'],
  'nav.sector_lead.reassign': ['admin.sl_reassign'],
  'nav.users.manage': ['admin.users'],
};

const SIDEBAR_NAV_CATALOG = [
  { key: 'nav.opportunities.all', group: 'nav', label: 'All Opportunities', type: 'nav' },
  { key: 'nav.proposals.new_direct', group: 'nav', label: 'New Direct MOU', type: 'nav' },
  { key: 'nav.matchmaking.my_proposals', group: 'nav', label: 'My Proposals', type: 'nav' },
  { key: 'nav.matchmaking.new_proposal', group: 'nav', label: 'New Proposal', type: 'nav' },
  { key: 'nav.matchmaking.review_queue', group: 'nav', label: 'Review Queue', type: 'nav' },
  { key: 'nav.matchmaking.forwarded', group: 'nav', label: 'Forwarded', type: 'nav' },
  { key: 'nav.matchmaking.matching_board', group: 'nav', label: 'Matching Board', type: 'nav' },
  { key: 'nav.matchmaking.all_matches', group: 'nav', label: 'Matches', type: 'nav' },
  { key: 'nav.complaints.all', group: 'nav', label: 'All Complaints', type: 'nav' },
  { key: 'nav.users.manage', group: 'nav', label: 'Users', type: 'nav' },
  { key: 'nav.sectors.manage', group: 'nav', label: 'Sectors', type: 'nav' },
  { key: 'nav.permissions.manage', group: 'nav', label: 'Permissions', type: 'nav' },
  { key: 'nav.sector_lead.reassign', group: 'nav', label: 'Sector Officer Change', type: 'nav' },
  { key: 'nav.compliance.audit', group: 'nav', label: 'Audit & Annual Returns', type: 'nav' },
  { key: 'nav.account.change_password', group: 'nav', label: 'Change Password', type: 'nav' },
];

const ACTION_PERMISSION_CATALOG = [
  { key: 'proposals.view', group: 'proposals', label: 'View proposal detail', type: 'action' },
  { key: 'proposals.view_own', group: 'proposals', label: 'View own proposals (legacy)', type: 'action', deprecated: true },
  { key: 'proposals.view_detail', group: 'proposals', label: 'View proposal detail (legacy)', type: 'action', deprecated: true },
  { key: 'proposals.list_own', group: 'proposals', label: 'List own proposals', type: 'action' },
  { key: 'proposals.activities.view', group: 'proposals', label: 'View proposal activities', type: 'action' },
  { key: 'proposals.activities.create', group: 'proposals', label: 'Create proposal activities', type: 'action' },
  { key: 'proposals.messages.view', group: 'proposals', label: 'View proposal chat', type: 'action' },
  { key: 'proposals.create', group: 'proposals', label: 'Create draft proposals', type: 'action' },
  { key: 'proposals.submit', group: 'proposals', label: 'Submit proposals', type: 'action' },
  { key: 'proposals.upload', group: 'proposals', label: 'Upload proposal files', type: 'action' },
  { key: 'proposals.list_sector', group: 'proposals', label: 'List sector proposals', type: 'action' },
  { key: 'proposals.list_all', group: 'proposals', label: 'List all proposals', type: 'action' },
  { key: 'proposals.filter_options', group: 'proposals', label: 'Proposal filters', type: 'action' },
  { key: 'proposals.approve', group: 'proposals', label: 'Approve proposals', type: 'action' },
  { key: 'proposals.reject', group: 'proposals', label: 'Reject proposals', type: 'action' },
  { key: 'proposals.export', group: 'proposals', label: 'Export proposal report', type: 'action' },
  { key: 'proposals.edit_contacts', group: 'proposals', label: 'Edit party contacts', type: 'action' },
  { key: 'proposals.mou.view', group: 'proposals', label: 'View MOU', type: 'action' },
  { key: 'proposals.mou.upload', group: 'proposals', label: 'Upload MOU', type: 'action' },
  { key: 'proposals.deal_close', group: 'proposals', label: 'Close deal', type: 'action' },
  { key: 'matchmaking.list_my', group: 'matchmaking', label: 'List my MM proposals', type: 'action' },
  { key: 'matchmaking.list_my_matches', group: 'matchmaking', label: 'List my matches', type: 'action' },
  { key: 'matchmaking.view', group: 'matchmaking', label: 'View MM proposal detail', type: 'action' },
  { key: 'matchmaking.submit', group: 'matchmaking', label: 'Submit MM proposal', type: 'action' },
  { key: 'matchmaking.upload', group: 'matchmaking', label: 'Upload MM files', type: 'action' },
  { key: 'matchmaking.list_review_queue', group: 'matchmaking', label: 'List review queue', type: 'action' },
  { key: 'matchmaking.list_forwarded', group: 'matchmaking', label: 'List forwarded proposals', type: 'action' },
  { key: 'matchmaking.list_board', group: 'matchmaking', label: 'List matching board', type: 'action' },
  { key: 'matchmaking.view_match_detail', group: 'matchmaking', label: 'View match detail', type: 'action' },
  { key: 'matchmaking.create', group: 'matchmaking', label: 'Create matchmaking proposal', type: 'action' },
  { key: 'matchmaking.review', group: 'matchmaking', label: 'Review matchmaking proposals', type: 'action' },
  { key: 'matchmaking.match', group: 'matchmaking', label: 'Create matches', type: 'action' },
  { key: 'matchmaking.view_matches', group: 'matchmaking', label: 'View matches list', type: 'action' },
  { key: 'matchmaking.view_all_matches', group: 'matchmaking', label: 'View all matches (admin)', type: 'action' },
  { key: 'complaints.list_all', group: 'complaints', label: 'List all complaints', type: 'action' },
  { key: 'complaints.list_own', group: 'complaints', label: 'List own complaints', type: 'action' },
  { key: 'complaints.list_sector', group: 'complaints', label: 'List sector complaints', type: 'action' },
  { key: 'complaints.view', group: 'complaints', label: 'View complaint detail', type: 'action' },
  { key: 'complaints.create', group: 'complaints', label: 'File complaints', type: 'action' },
  { key: 'complaints.review', group: 'complaints', label: 'Review complaints', type: 'action' },
  { key: 'users.list', group: 'users', label: 'List users', type: 'action' },
  { key: 'users.create', group: 'users', label: 'Create users', type: 'action' },
  { key: 'users.update', group: 'users', label: 'Update users', type: 'action' },
  { key: 'users.delete', group: 'users', label: 'Delete users', type: 'action' },
  { key: 'users.change_role', group: 'users', label: 'Change user role', type: 'action' },
  { key: 'admin.sectors', group: 'admin', label: 'Manage sectors', type: 'action' },
  { key: 'admin.sl_reassign', group: 'admin', label: 'Sector lead reassign', type: 'action' },
  { key: 'admin.compliance', group: 'admin', label: 'Compliance admin', type: 'action' },
  { key: 'admin.rbac', group: 'admin', label: 'Manage role permissions', type: 'action' },
  { key: 'admin.users', group: 'admin', label: 'Manage users (admin)', type: 'action' },
  { key: 'profile.party_a.edit', group: 'profiles', label: 'Edit Party A profile', type: 'action' },
  { key: 'profile.party_b.edit', group: 'profiles', label: 'Edit Party B profile', type: 'action' },
  { key: 'profile.party_a.view', group: 'profiles', label: 'View Party A profiles', type: 'action' },
  { key: 'profile.party_b.view', group: 'profiles', label: 'View Party B profiles', type: 'action' },
];

const PERMISSION_CATALOG = [...SIDEBAR_NAV_CATALOG, ...ACTION_PERMISSION_CATALOG];

const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

const GROUP_LABELS = {
  nav: 'Navigation',
  proposals: 'Proposals',
  matchmaking: 'Matchmaking',
  complaints: 'Complaints',
  users: 'Users',
  admin: 'Administration',
  profiles: 'Profiles',
};

const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'nav.sectors.manage',
    'nav.account.change_password',
    'admin.sectors',
    'profile.party_a.view',
    'profile.party_b.view',
  ],
  sector_lead: [
    'nav.matchmaking.forwarded',
    'nav.matchmaking.matching_board',
    'nav.matchmaking.all_matches',
    'nav.complaints.all',
    'nav.account.change_password',
    'proposals.view',
    'proposals.activities.view',
    'proposals.list_sector',
    'proposals.filter_options',
    'proposals.approve',
    'proposals.reject',
    'proposals.export',
    'proposals.edit_contacts',
    'proposals.mou.view',
    'proposals.mou.upload',
    'proposals.deal_close',
    'matchmaking.list_forwarded',
    'matchmaking.list_board',
    'matchmaking.view',
    'matchmaking.review',
    'matchmaking.match',
    'matchmaking.view_matches',
    'matchmaking.view_match_detail',
    'complaints.list_all',
    'complaints.view',
    'complaints.review',
    'profile.party_a.view',
    'profile.party_b.view',
  ],
  focal_point: [
    'nav.matchmaking.review_queue',
    'nav.matchmaking.matching_board',
    'nav.account.change_password',
    'matchmaking.list_review_queue',
    'matchmaking.list_board',
    'matchmaking.view',
    'matchmaking.review',
    'matchmaking.match',
    'matchmaking.view_matches',
    'matchmaking.view_match_detail',
    'proposals.view',
    'proposals.mou.view',
  ],
  regional_focal_point: [
    'nav.matchmaking.review_queue',
    'nav.matchmaking.forwarded',
    'nav.matchmaking.matching_board',
    'nav.account.change_password',
    'matchmaking.list_review_queue',
    'matchmaking.list_forwarded',
    'matchmaking.list_board',
    'matchmaking.view',
    'matchmaking.review',
    'matchmaking.match',
    'matchmaking.view_matches',
    'complaints.create',
    'complaints.review',
    'proposals.view',
    'proposals.mou.view',
  ],
  party_a: [
    'nav.proposals.new_direct',
    'nav.matchmaking.my_proposals',
    'nav.matchmaking.new_proposal',
    'nav.complaints.all',
    'nav.account.change_password',
    'proposals.create',
    'proposals.submit',
    'proposals.upload',
    'proposals.view',
    'proposals.activities.view',
    'proposals.messages.view',
    'proposals.mou.view',
    'proposals.mou.upload',
    'matchmaking.list_my',
    'matchmaking.view',
    'matchmaking.create',
    'matchmaking.submit',
    'matchmaking.upload',
    'complaints.list_own',
    'complaints.view',
    'complaints.create',
    'profile.party_a.edit',
  ],
  party_b: [
    'nav.complaints.all',
    'nav.account.change_password',
    'proposals.view',
    'proposals.mou.view',
    'proposals.mou.upload',
    'complaints.list_own',
    'complaints.view',
    'complaints.create',
    'profile.party_b.edit',
  ],
  investor: [
    'nav.matchmaking.my_proposals',
    'nav.matchmaking.new_proposal',
    'nav.matchmaking.all_matches',
    'nav.account.change_password',
    'proposals.view',
    'proposals.mou.view',
    'matchmaking.list_my',
    'matchmaking.view',
    'matchmaking.create',
    'matchmaking.submit',
    'matchmaking.upload',
    'matchmaking.view_matches',
    'matchmaking.view_match_detail',
    'profile.party_b.edit',
  ],
};

function getStaticPermissionsForRole(role) {
  const assigned = ROLE_PERMISSIONS[role];
  if (!assigned) return [];
  if (assigned.includes('*')) return [...ALL_PERMISSION_KEYS];
  return [...assigned];
}

function expandPermissionAliases(permissions) {
  const set = new Set(permissions);
  permissions.forEach((key) => {
    const canonical = PERMISSION_ALIASES[key];
    if (canonical) set.add(canonical);
    Object.entries(PERMISSION_ALIASES).forEach(([legacy, canon]) => {
      if (key === canon) set.add(legacy);
    });
  });
  return [...set];
}

function normalizeClientPermissions(permissions) {
  const out = new Set();
  permissions.forEach((key) => {
    if (OBSOLETE_NAV_KEYS.includes(key)) {
      const mapped = PERMISSION_ALIASES[key];
      if (mapped && SIDEBAR_NAV_KEYS.includes(mapped)) out.add(mapped);
      return;
    }
    if (key.startsWith('nav.') && !SIDEBAR_NAV_KEYS.includes(key)) return;
    out.add(key);
  });
  return [...out].sort();
}

function permissionMatchesGrant(requiredPermission, grantedPermissions) {
  const expanded = expandPermissionAliases(grantedPermissions);
  return expanded.includes(requiredPermission);
}

function userHasNavPermission(user, itemPermission, permissionsList) {
  if (user?.role === 'super_admin') {
    return SIDEBAR_NAV_KEYS.includes(itemPermission);
  }
  return navItemGranted(user, itemPermission, permissionsList);
}

function navItemGranted(user, itemPermission, permissionsList) {
  if (permissionMatchesGrant(itemPermission, permissionsList)) return true;
  const adminKeys = ADMIN_NAV_GRANTS[itemPermission] || [];
  return adminKeys.some((key) => permissionMatchesGrant(key, permissionsList));
}

function buildNavigationFromPermissions(user, permissionsList) {
  const seenPaths = new Set();
  const sectionOrder = [];
  const sectionMap = {};

  NAV_CATALOG.filter((item) => userHasNavPermission(user, item.permission, permissionsList))
    .sort((a, b) => a.order - b.order)
    .forEach((item) => {
      const path = resolveNavPath(item);
      const pathKey = normalizeNavPath(path);
      if (seenPaths.has(pathKey)) return;
      seenPaths.add(pathKey);

      if (!sectionMap[item.section]) {
        sectionMap[item.section] = [];
        sectionOrder.push(item.section);
      }
      sectionMap[item.section].push({
        key: item.key,
        label: item.label,
        path,
        permission: item.permission,
      });
    });

  return sectionOrder
    .map((section) => ({ section, items: sectionMap[section] }))
    .filter((block) => block.items.length > 0);
}

function resolveRedirectFromNavigation(user, navigation) {
  if (user.must_change_password) return '/auth/change-password';
  for (const block of navigation) {
    if (block.items?.length) return block.items[0].path;
  }
  return null;
}

function buildRbacContext(user, permissions = []) {
  const listScope = require('./permissionBundles').resolveProposalsListScope(user, permissions);
  return {
    sector: user.sector || null,
    country: user.country || null,
    scoped_sector: user.role === 'sector_lead' ? user.sector || null : null,
    scoped_country: user.role === 'regional_focal_point' ? user.country || null : null,
    list_scope: listScope.list_scope,
    proposals_list_api: listScope.proposals_list_api,
  };
}

async function loadUserPermissions(user) {
  const { getStoredPermissionsForRole } = require('./rolePermissionStore');
  return getStoredPermissionsForRole(user.role);
}

async function getPermissionsForRole(role) {
  return loadUserPermissions({ role });
}

async function hasPermission(user, permission, permissionsList) {
  if (!user?.role || !permission) return false;
  if (user.role === 'super_admin') return true;
  const perms = permissionsList || (await loadUserPermissions(user));
  return permissionMatchesGrant(permission, perms);
}

async function hasAnyPermission(user, permissions, permissionsList) {
  if (!user?.role || !permissions?.length) return false;
  if (user.role === 'super_admin') return true;
  const perms = permissionsList || (await loadUserPermissions(user));
  return permissions.some((p) => permissionMatchesGrant(p, perms));
}

async function buildRbacPayload(user) {
  const rawPermissions = await loadUserPermissions(user);
  const permissions = normalizeClientPermissions(rawPermissions);
  const navigation = buildNavigationFromPermissions(user, rawPermissions);
  const listScope = require('./permissionBundles').resolveProposalsListScope(user, rawPermissions);

  return {
    role: user.role,
    role_label: ROLE_LABELS[user.role] || user.role,
    permissions,
    navigation,
    context: buildRbacContext(user, rawPermissions),
    capabilities: {
      proposals_list_api: listScope.proposals_list_api,
    },
    redirect: resolveRedirectFromNavigation(user, navigation),
    source: 'database',
    sidebar_nav_count: navigation.reduce((n, s) => n + s.items.length, 0),
    sidebar_nav_max: SIDEBAR_NAV_KEYS.length,
  };
}

function routeForPermissionKey(key) {
  if (NAV_ROUTE_BY_PERMISSION[key]) return NAV_ROUTE_BY_PERMISSION[key];
  const canonical = PERMISSION_ALIASES[key];
  if (canonical && NAV_ROUTE_BY_PERMISSION[canonical]) return NAV_ROUTE_BY_PERMISSION[canonical];
  return null;
}

function enrichCatalogEntry(entry) {
  const type = entry.type || (entry.group === 'nav' ? 'nav' : 'action');
  return {
    key: entry.key,
    label: entry.label,
    group: entry.group,
    type,
    route: type === 'nav' ? routeForPermissionKey(entry.key) : null,
  };
}

function buildGroupedPermissionCatalog(catalog) {
  const sidebarSet = new Set(SIDEBAR_NAV_KEYS);
  const filtered = catalog.filter(
    (entry) => entry.group !== 'nav' || sidebarSet.has(entry.key)
  );

  const grouped = filtered.reduce((acc, entry) => {
    const enriched = enrichCatalogEntry(entry);
    if (!acc[enriched.group]) acc[enriched.group] = [];
    acc[enriched.group].push(enriched);
    return acc;
  }, {});

  const groups = Object.keys(grouped)
    .sort()
    .map((key) => ({
      key,
      label: GROUP_LABELS[key] || key,
      permissions: grouped[key],
    }));

  return {
    catalog: filtered.map(enrichCatalogEntry),
    groups,
    sidebar_nav_keys: SIDEBAR_NAV_KEYS,
    sidebar_nav_max: SIDEBAR_NAV_KEYS.length,
  };
}

async function buildRbacCatalog() {
  const { getPermissionCatalogFromDb, getStoredPermissionsForRole } = require('./rolePermissionStore');
  const rawCatalog = await getPermissionCatalogFromDb();
  const { catalog, groups, sidebar_nav_keys, sidebar_nav_max } = buildGroupedPermissionCatalog(
    rawCatalog.length ? rawCatalog : PERMISSION_CATALOG
  );

  const roles = await Promise.all(
    VALID_ROLES.map(async (role) => {
      const raw = await getStoredPermissionsForRole(role);
      const permissions = normalizeClientPermissions(raw);
      return {
        value: role,
        label: ROLE_LABELS[role] || role,
        permissions,
        navigation: buildNavigationFromPermissions({ role }, raw),
        sidebar_nav_count: buildNavigationFromPermissions({ role }, raw).reduce(
          (n, s) => n + s.items.length,
          0
        ),
        sidebar_nav_max,
      };
    })
  );

  return { roles, permission_catalog: catalog, groups, sidebar_nav_keys, sidebar_nav_max };
}

function buildNavigationForRole(role, permissions) {
  return buildNavigationFromPermissions({ role }, permissions);
}

module.exports = {
  PERMISSION_CATALOG,
  PERMISSION_ALIASES,
  OBSOLETE_NAV_KEYS,
  SIDEBAR_NAV_KEYS,
  ADMIN_NAV_GRANTS,
  ALL_PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  NAV_CATALOG,
  GROUP_LABELS,
  getStaticPermissionsForRole,
  getPermissionsForRole,
  expandPermissionAliases,
  normalizeClientPermissions,
  permissionMatchesGrant,
  buildNavigationFromPermissions,
  buildNavigationForRole,
  resolveRedirectFromNavigation,
  buildRbacContext,
  loadUserPermissions,
  hasPermission,
  hasAnyPermission,
  buildRbacPayload,
  buildRbacCatalog,
  buildGroupedPermissionCatalog,
  enrichCatalogEntry,
};

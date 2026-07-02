const { SIDEBAR_NAV_KEYS } = require('./navCatalog');

/**
 * Hierarchical RBAC: each nav.* key maps to list/detail APIs and action grants.
 * Keys in DB: PERMISSION_CATALOG in rolePermissions.js
 */
const NAV_PERMISSION_BUNDLES = [
  {
    nav_key: 'nav.opportunities.all',
    label: 'All Opportunities',
    route: '/dashboard/super-admin',
    list_apis: [
      { method: 'GET', path: '/api/proposals/all', permission: 'proposals.list_all', required: true },
      { method: 'GET', path: '/api/proposals/filter-options', permission: 'proposals.filter_options', required: true },
    ],
    detail_apis: [
      { method: 'GET', path: '/api/proposals/:id', permission: 'proposals.view', required: true },
      { method: 'GET', path: '/api/proposals/:proposalId/activities', permission: 'proposals.activities.view', required: true },
      { method: 'GET', path: '/api/proposals/:proposalId/messages', permission: 'proposals.messages.view', required: false },
      { method: 'GET', path: '/api/proposals/:id/mou', permission: 'proposals.mou.view', required: false },
      { method: 'GET', path: '/api/proposals/:id/mou/status', permission: 'proposals.mou.view', required: false },
    ],
    actions: [
      { permission: 'proposals.approve', label: 'Approve proposal', apis: [{ method: 'PATCH', path: '/api/proposals/:id/approve' }] },
      { permission: 'proposals.reject', label: 'Reject proposal', apis: [{ method: 'PATCH', path: '/api/proposals/:id/reject' }] },
      { permission: 'proposals.export', label: 'Export report', apis: [{ method: 'GET', path: '/api/proposals/:id/export-report' }] },
      { permission: 'proposals.edit_contacts', label: 'Edit party contacts', apis: [{ method: 'PATCH', path: '/api/proposals/:id/party-contacts' }] },
      { permission: 'proposals.deal_close', label: 'Close deal', apis: [{ method: 'PATCH', path: '/api/proposals/:id/close-deal' }] },
      { permission: 'proposals.activities.create', label: 'Add activity', apis: [{ method: 'POST', path: '/api/proposals/:proposalId/activities' }] },
      { permission: 'proposals.mou.upload', label: 'Upload MOU', apis: [{ method: 'PATCH', path: '/api/proposals/:id/mou' }] },
    ],
    default_grant_on_nav: {
      minimum: [
        'proposals.list_all',
        'proposals.filter_options',
        'proposals.view',
        'proposals.activities.view',
      ],
      suggested: ['proposals.messages.view', 'proposals.mou.view'],
    },
    full_grant_on_nav: [
      'proposals.list_all',
      'proposals.filter_options',
      'proposals.view',
      'proposals.activities.view',
      'proposals.messages.view',
      'proposals.mou.view',
      'proposals.approve',
      'proposals.reject',
      'proposals.export',
      'proposals.edit_contacts',
      'proposals.deal_close',
      'proposals.activities.create',
      'proposals.mou.upload',
    ],
  },
  {
    nav_key: 'nav.proposals.new_direct',
    label: 'New Direct MOU',
    route: '/proposals/new',
    list_apis: [],
    detail_apis: [],
    actions: [
      { permission: 'proposals.create', label: 'Create draft', apis: [{ method: 'POST', path: '/api/proposals/draft' }] },
      { permission: 'proposals.submit', label: 'Submit proposal', apis: [{ method: 'POST', path: '/api/proposals/submit' }] },
      { permission: 'proposals.upload', label: 'Upload file', apis: [{ method: 'POST', path: '/api/proposals/upload' }] },
    ],
    default_grant_on_nav: {
      minimum: ['proposals.create', 'proposals.submit', 'proposals.upload'],
      suggested: ['proposals.view'],
    },
    full_grant_on_nav: ['proposals.create', 'proposals.submit', 'proposals.upload', 'proposals.view', 'proposals.mou.view', 'proposals.mou.upload'],
  },
  {
    nav_key: 'nav.matchmaking.my_proposals',
    label: 'My Proposals (matchmaking)',
    route: '/matchmaking/my-proposals',
    list_apis: [
      { method: 'GET', path: '/api/matchmaking/proposals/my', permission: 'matchmaking.list_my', required: true },
      { method: 'GET', path: '/api/matchmaking/matches/my', permission: 'matchmaking.list_my_matches', required: false },
    ],
    detail_apis: [
      { method: 'GET', path: '/api/matchmaking/proposals/:id', permission: 'matchmaking.view', required: true },
    ],
    actions: [],
    default_grant_on_nav: {
      minimum: ['matchmaking.list_my', 'matchmaking.view'],
      suggested: ['proposals.view'],
    },
    full_grant_on_nav: ['matchmaking.list_my', 'matchmaking.view', 'matchmaking.list_my_matches', 'proposals.view'],
  },
  {
    nav_key: 'nav.matchmaking.new_proposal',
    label: 'New Proposal (matchmaking)',
    route: '/matchmaking/new',
    list_apis: [],
    detail_apis: [],
    actions: [
      { permission: 'matchmaking.create', label: 'Create MM proposal', apis: [{ method: 'POST', path: '/api/matchmaking/proposals/draft' }] },
      { permission: 'matchmaking.submit', label: 'Submit MM proposal', apis: [{ method: 'POST', path: '/api/matchmaking/proposals/submit' }] },
      { permission: 'matchmaking.upload', label: 'Upload MM file', apis: [{ method: 'POST', path: '/api/matchmaking/proposals/upload' }] },
    ],
    default_grant_on_nav: {
      minimum: ['matchmaking.create', 'matchmaking.submit', 'matchmaking.upload'],
      suggested: [],
    },
    full_grant_on_nav: ['matchmaking.create', 'matchmaking.submit', 'matchmaking.upload', 'matchmaking.view'],
  },
  {
    nav_key: 'nav.matchmaking.review_queue',
    label: 'Review Queue',
    route: '/matchmaking/focal-point',
    list_apis: [
      { method: 'GET', path: '/api/matchmaking/proposals/focal-point', permission: 'matchmaking.list_review_queue', required: true },
    ],
    detail_apis: [
      { method: 'GET', path: '/api/matchmaking/proposals/:id', permission: 'matchmaking.view', required: true },
    ],
    actions: [
      { permission: 'matchmaking.review', label: 'Shortlist / reject / forward', apis: [{ method: 'PATCH', path: '/api/matchmaking/proposals/:id/shortlist' }] },
    ],
    default_grant_on_nav: {
      minimum: ['matchmaking.list_review_queue', 'matchmaking.view', 'matchmaking.review'],
      suggested: [],
    },
    full_grant_on_nav: ['matchmaking.list_review_queue', 'matchmaking.view', 'matchmaking.review'],
  },
  {
    nav_key: 'nav.matchmaking.forwarded',
    label: 'Forwarded',
    route: '/matchmaking/forwarded',
    list_apis: [
      { method: 'GET', path: '/api/matchmaking/proposals/forwarded-to-me', permission: 'matchmaking.list_forwarded', required: true },
    ],
    detail_apis: [
      { method: 'GET', path: '/api/matchmaking/proposals/:id', permission: 'matchmaking.view', required: true },
    ],
    actions: [{ permission: 'matchmaking.review', label: 'Review forwarded', apis: [] }],
    default_grant_on_nav: {
      minimum: ['matchmaking.list_forwarded', 'matchmaking.view', 'matchmaking.review'],
      suggested: [],
    },
    full_grant_on_nav: ['matchmaking.list_forwarded', 'matchmaking.view', 'matchmaking.review'],
  },
  {
    nav_key: 'nav.matchmaking.matching_board',
    label: 'Matching Board',
    route: '/matchmaking/board',
    list_apis: [
      { method: 'GET', path: '/api/matchmaking/proposals/all-for-matching', permission: 'matchmaking.list_board', required: true },
    ],
    detail_apis: [
      { method: 'GET', path: '/api/matchmaking/proposals/:id', permission: 'matchmaking.view', required: true },
    ],
    actions: [
      { permission: 'matchmaking.match', label: 'Create match', apis: [{ method: 'POST', path: '/api/matchmaking/matches' }] },
    ],
    default_grant_on_nav: {
      minimum: ['matchmaking.list_board', 'matchmaking.view', 'matchmaking.match'],
      suggested: [],
    },
    full_grant_on_nav: ['matchmaking.list_board', 'matchmaking.view', 'matchmaking.match'],
  },
  {
    nav_key: 'nav.matchmaking.all_matches',
    label: 'Matches',
    route: '/matchmaking/matches',
    list_apis: [
      { method: 'GET', path: '/api/matchmaking/matches/matched', permission: 'matchmaking.view_matches', required: true },
    ],
    detail_apis: [
      { method: 'GET', path: '/api/matchmaking/matches/:id', permission: 'matchmaking.view_match_detail', required: true },
    ],
    actions: [],
    default_grant_on_nav: {
      minimum: ['matchmaking.view_matches', 'matchmaking.view_match_detail'],
      suggested: ['proposals.view'],
    },
    full_grant_on_nav: ['matchmaking.view_matches', 'matchmaking.view_match_detail', 'proposals.view', 'proposals.mou.view'],
  },
  {
    nav_key: 'nav.complaints.all',
    label: 'All Complaints',
    route: '/complaints',
    list_apis: [
      { method: 'GET', path: '/api/complaints/all', permission: 'complaints.list_all', required: true },
      { method: 'GET', path: '/api/complaints/my', permission: 'complaints.list_own', required: false },
      { method: 'GET', path: '/api/complaints/sector', permission: 'complaints.list_sector', required: false },
    ],
    detail_apis: [
      { method: 'GET', path: '/api/complaints/:id', permission: 'complaints.view', required: true },
    ],
    actions: [
      { permission: 'complaints.create', label: 'File complaint', apis: [{ method: 'POST', path: '/api/complaints' }] },
      { permission: 'complaints.review', label: 'Approve / reject', apis: [{ method: 'PATCH', path: '/api/complaints/:id/approve' }] },
    ],
    default_grant_on_nav: {
      minimum: ['complaints.list_all', 'complaints.view'],
      suggested: ['complaints.create'],
    },
    full_grant_on_nav: ['complaints.list_all', 'complaints.list_own', 'complaints.list_sector', 'complaints.view', 'complaints.create', 'complaints.review'],
  },
  {
    nav_key: 'nav.users.manage',
    label: 'Users',
    route: '/admin/users',
    list_apis: [{ method: 'GET', path: '/api/users', permission: 'users.list', required: true }],
    detail_apis: [{ method: 'GET', path: '/api/users/:id', permission: 'users.list', required: true }],
    actions: [
      { permission: 'users.create', label: 'Create user', apis: [{ method: 'POST', path: '/api/users' }] },
      { permission: 'users.update', label: 'Update user', apis: [{ method: 'PATCH', path: '/api/users/:id' }] },
      { permission: 'users.delete', label: 'Delete user', apis: [{ method: 'DELETE', path: '/api/users/:id' }] },
      { permission: 'users.change_role', label: 'Change role', apis: [{ method: 'PATCH', path: '/api/users/:id/role' }] },
    ],
    default_grant_on_nav: {
      minimum: ['users.list'],
      suggested: [],
    },
    full_grant_on_nav: ['users.list', 'users.create', 'users.update', 'users.delete', 'users.change_role', 'admin.users'],
  },
  {
    nav_key: 'nav.sectors.manage',
    label: 'Sectors',
    route: '/admin/sectors',
    list_apis: [{ method: 'GET', path: '/api/admin/sectors', permission: 'admin.sectors', required: true }],
    detail_apis: [{ method: 'GET', path: '/api/admin/sectors/:id', permission: 'admin.sectors', required: true }],
    actions: [
      { permission: 'admin.sectors', label: 'Manage sectors', apis: [{ method: 'POST', path: '/api/admin/sectors' }] },
    ],
    default_grant_on_nav: {
      minimum: ['admin.sectors'],
      suggested: [],
    },
    full_grant_on_nav: ['admin.sectors'],
  },
  {
    nav_key: 'nav.permissions.manage',
    label: 'Permissions',
    route: '/admin/permissions',
    list_apis: [
      { method: 'GET', path: '/api/admin/rbac/permissions', permission: 'admin.rbac', required: true },
      { method: 'GET', path: '/api/admin/rbac/roles', permission: 'admin.rbac', required: true },
      { method: 'GET', path: '/api/admin/rbac/permission-bundles', permission: 'admin.rbac', required: true },
    ],
    detail_apis: [{ method: 'GET', path: '/api/admin/rbac/roles/:role', permission: 'admin.rbac', required: true }],
    actions: [
      { permission: 'admin.rbac', label: 'Edit role permissions', apis: [{ method: 'PATCH', path: '/api/admin/rbac/roles/:role' }] },
    ],
    default_grant_on_nav: {
      minimum: ['admin.rbac'],
      suggested: [],
    },
    full_grant_on_nav: ['admin.rbac'],
  },
  {
    nav_key: 'nav.sector_lead.reassign',
    label: 'Sector Officer Change',
    route: '/dashboard/super-admin/sector-lead/handoff',
    list_apis: [
      { method: 'GET', path: '/api/admin/sector-lead/reassignments', permission: 'admin.sl_reassign', required: true },
      { method: 'GET', path: '/api/admin/sector-lead/orphans', permission: 'admin.sl_reassign', required: true },
    ],
    detail_apis: [],
    actions: [
      { permission: 'admin.sl_reassign', label: 'Reassign sector lead', apis: [{ method: 'PATCH', path: '/api/admin/sector-lead/reassign' }] },
    ],
    default_grant_on_nav: {
      minimum: ['admin.sl_reassign'],
      suggested: [],
    },
    full_grant_on_nav: ['admin.sl_reassign'],
  },
  {
    nav_key: 'nav.compliance.audit',
    label: 'Audit & Annual Returns',
    route: '/dashboard/super-admin/compliance',
    list_apis: [
      { method: 'GET', path: '/api/admin/compliance-filings', permission: 'admin.compliance', required: true },
      { method: 'GET', path: '/api/admin/compliance-filings/overview', permission: 'admin.compliance', required: true },
    ],
    detail_apis: [
      { method: 'GET', path: '/api/admin/compliance-filings/users/:userId/matrix', permission: 'admin.compliance', required: true },
    ],
    actions: [
      { permission: 'admin.compliance', label: 'Upload filing', apis: [{ method: 'POST', path: '/api/admin/compliance-filings' }] },
    ],
    default_grant_on_nav: {
      minimum: ['admin.compliance'],
      suggested: [],
    },
    full_grant_on_nav: ['admin.compliance'],
  },
  {
    nav_key: 'nav.account.change_password',
    label: 'Change Password',
    route: '/auth/change-password',
    list_apis: [],
    detail_apis: [],
    actions: [],
    default_grant_on_nav: { minimum: [], suggested: [] },
    full_grant_on_nav: [],
  },
];

const BUNDLE_BY_NAV_KEY = Object.fromEntries(
  NAV_PERMISSION_BUNDLES.map((bundle) => [bundle.nav_key, bundle])
);

function getBundleByNavKey(navKey) {
  return BUNDLE_BY_NAV_KEY[navKey] || null;
}

function resolveBundleGrantKeys(navKey, level = 'minimum', customKeys = []) {
  const bundle = getBundleByNavKey(navKey);
  if (!bundle) {
    return { error: `Unknown nav key: ${navKey}` };
  }
  if (!SIDEBAR_NAV_KEYS.includes(navKey)) {
    return { error: `Not a sidebar nav key: ${navKey}` };
  }

  let actionKeys = [];
  if (level === 'minimum') {
    actionKeys = [...(bundle.default_grant_on_nav?.minimum || [])];
  } else if (level === 'full') {
    actionKeys = [...(bundle.full_grant_on_nav || [])];
  } else if (level === 'custom') {
    if (!Array.isArray(customKeys) || !customKeys.length) {
      return { error: 'custom level requires permissions array' };
    }
    actionKeys = [...customKeys];
  } else {
    return { error: 'level must be minimum, full, or custom' };
  }

  const grant = [...new Set([navKey, ...actionKeys])];
  return { grant, bundle };
}

function expandNavGrantsWithMinimumBundles(grantKeys) {
  const expanded = new Set(grantKeys);
  grantKeys.forEach((key) => {
    if (!SIDEBAR_NAV_KEYS.includes(key)) return;
    const bundle = getBundleByNavKey(key);
    if (!bundle) return;
    expanded.add(key);
    (bundle.default_grant_on_nav?.minimum || []).forEach((p) => expanded.add(p));
  });
  return [...expanded];
}

function getAllApiPermissionKeys() {
  const keys = new Set();
  NAV_PERMISSION_BUNDLES.forEach((bundle) => {
    bundle.list_apis.forEach((api) => keys.add(api.permission));
    bundle.detail_apis.forEach((api) => keys.add(api.permission));
    bundle.actions.forEach((action) => keys.add(action.permission));
  });
  return [...keys].sort();
}

module.exports = {
  NAV_PERMISSION_BUNDLES,
  getBundleByNavKey,
  resolveBundleGrantKeys,
  expandNavGrantsWithMinimumBundles,
  getAllApiPermissionKeys,
};

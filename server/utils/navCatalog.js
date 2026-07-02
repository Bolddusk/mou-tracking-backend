/**
 * Sidebar catalog — exactly 15 nav.* permissions.
 * Must match frontend `sidebarPermissions.js`.
 */
const SIDEBAR_NAV_KEYS = [
  'nav.opportunities.all',
  'nav.proposals.new_direct',
  'nav.matchmaking.my_proposals',
  'nav.matchmaking.new_proposal',
  'nav.matchmaking.review_queue',
  'nav.matchmaking.forwarded',
  'nav.matchmaking.matching_board',
  'nav.matchmaking.all_matches',
  'nav.complaints.all',
  'nav.users.manage',
  'nav.sectors.manage',
  'nav.permissions.manage',
  'nav.sector_lead.reassign',
  'nav.compliance.audit',
  'nav.account.change_password',
];

const NAV_CATALOG = [
  {
    key: 'opportunities_all',
    label: 'All Opportunities',
    path: '/dashboard/super-admin',
    permission: 'nav.opportunities.all',
    section: 'OVERVIEW',
    order: 10,
  },
  {
    key: 'proposals_new_direct',
    label: 'New Direct MOU',
    path: '/proposals/new',
    permission: 'nav.proposals.new_direct',
    section: 'PROPOSALS',
    order: 20,
  },
  {
    key: 'mm_my_proposals',
    label: 'My Proposals',
    path: '/matchmaking/my-proposals',
    permission: 'nav.matchmaking.my_proposals',
    section: 'MATCHMAKING',
    order: 30,
  },
  {
    key: 'mm_new',
    label: 'New Proposal',
    path: '/matchmaking/new',
    permission: 'nav.matchmaking.new_proposal',
    section: 'MATCHMAKING',
    order: 31,
  },
  {
    key: 'mm_review',
    label: 'Review Queue',
    path: '/matchmaking/focal-point',
    permission: 'nav.matchmaking.review_queue',
    section: 'MATCHMAKING',
    order: 32,
  },
  {
    key: 'mm_forwarded',
    label: 'Forwarded',
    path: '/matchmaking/forwarded',
    permission: 'nav.matchmaking.forwarded',
    section: 'MATCHMAKING',
    order: 33,
  },
  {
    key: 'mm_board',
    label: 'Matching Board',
    path: '/matchmaking/board',
    permission: 'nav.matchmaking.matching_board',
    section: 'MATCHMAKING',
    order: 34,
  },
  {
    key: 'mm_all_matches',
    label: 'Matches',
    path: '/matchmaking/matches',
    permission: 'nav.matchmaking.all_matches',
    section: 'MATCHMAKING',
    order: 35,
  },
  {
    key: 'complaints_all',
    label: 'All Complaints',
    path: '/complaints',
    permission: 'nav.complaints.all',
    section: 'COMPLAINTS',
    order: 40,
  },
  {
    key: 'users',
    label: 'Users',
    path: '/admin/users',
    permission: 'nav.users.manage',
    section: 'ADMINISTRATION',
    order: 50,
  },
  {
    key: 'sectors',
    label: 'Sectors',
    path: '/admin/sectors',
    permission: 'nav.sectors.manage',
    section: 'ADMINISTRATION',
    order: 51,
  },
  {
    key: 'permissions',
    label: 'Permissions',
    path: '/admin/permissions',
    permission: 'nav.permissions.manage',
    section: 'ADMINISTRATION',
    order: 52,
  },
  {
    key: 'sl_reassign',
    label: 'Sector Officer Change',
    path: '/dashboard/super-admin/sector-lead/handoff',
    permission: 'nav.sector_lead.reassign',
    section: 'ADMINISTRATION',
    order: 53,
  },
  {
    key: 'compliance',
    label: 'Audit & Annual Returns',
    path: '/dashboard/super-admin/compliance',
    permission: 'nav.compliance.audit',
    section: 'ADMINISTRATION',
    order: 54,
  },
  {
    key: 'change_password',
    label: 'Change Password',
    path: '/auth/change-password',
    permission: 'nav.account.change_password',
    section: 'ACCOUNT',
    order: 60,
  },
];

const NAV_ROUTE_BY_PERMISSION = Object.fromEntries(
  NAV_CATALOG.map((item) => [item.permission, item.path])
);

function normalizeNavPath(path) {
  if (!path) return '';
  const trimmed = String(path).replace(/\/+$/, '');
  return (trimmed || '/').toLowerCase();
}

function resolveNavPath(item) {
  return item.path;
}

module.exports = {
  SIDEBAR_NAV_KEYS,
  NAV_CATALOG,
  NAV_ROUTE_BY_PERMISSION,
  resolveNavPath,
  normalizeNavPath,
};

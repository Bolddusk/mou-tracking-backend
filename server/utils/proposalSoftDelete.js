const ADMIN_ARCHIVE_ROLES = new Set(['super_admin', 'admin']);

function isProposalArchived(proposal) {
  return Boolean(proposal?.deleted_at);
}

function canArchiveProposals(user) {
  return ADMIN_ARCHIVE_ROLES.has(user?.role);
}

function buildNotArchivedSql(alias = 'p') {
  return `${alias}.deleted_at IS NULL`;
}

module.exports = {
  ADMIN_ARCHIVE_ROLES,
  isProposalArchived,
  canArchiveProposals,
  buildNotArchivedSql,
};

const INTERNAL_STATUSES = ['forwarded', 'returned_to_sector_lead'];

function checkComplaintAccess(req, complaint) {
  if (!complaint) {
    return { ok: false, status: 404, error: 'Complaint not found' };
  }

  const { role, id: userId } = req.user;

  if (role === 'super_admin') {
    return { ok: true };
  }

  if (role === 'party_a' && complaint.filed_by === userId) {
    return { ok: true };
  }

  if (role === 'party_b' && complaint.filed_by === userId) {
    return { ok: true };
  }

  if (
    role === 'party_b' &&
    complaint.party_b_user_id === userId &&
    complaint.party_b_tagged_at &&
    complaint.status === 'forwarded'
  ) {
    return { ok: true };
  }

  if (role === 'sector_lead' && complaint.tagged_sector_lead === userId) {
    return { ok: true };
  }

  if (role === 'regional_focal_point' && complaint.forwarded_to === userId) {
    return { ok: true };
  }

  return { ok: false, status: 403, error: 'Access denied' };
}

function checkSectorLeadReviewAccess(req, complaint) {
  if (!complaint) {
    return { ok: false, status: 404, error: 'Complaint not found' };
  }

  const { role, id: userId } = req.user;

  if (role === 'super_admin') {
    return { ok: true };
  }

  if (
    role === 'sector_lead' &&
    complaint.tagged_sector_lead === userId &&
    ['open', 'under_review', 'returned_to_sector_lead'].includes(complaint.status)
  ) {
    return { ok: true };
  }

  return { ok: false, status: 403, error: 'Access denied' };
}

function checkRfpReviewAccess(req, complaint) {
  if (!complaint) {
    return { ok: false, status: 404, error: 'Complaint not found' };
  }

  const { role, id: userId } = req.user;

  if (role === 'super_admin') {
    return { ok: true };
  }

  if (
    role === 'regional_focal_point' &&
    complaint.forwarded_to === userId &&
    complaint.status === 'forwarded'
  ) {
    return { ok: true };
  }

  return { ok: false, status: 403, error: 'Access denied' };
}

function checkComplaintReviewAccess(req, complaint) {
  const sector = checkSectorLeadReviewAccess(req, complaint);
  if (sector.ok) return sector;

  const rfp = checkRfpReviewAccess(req, complaint);
  if (rfp.ok) return rfp;

  return { ok: false, status: 403, error: 'Access denied' };
}

function canViewInternalTimeline(role) {
  return ['sector_lead', 'regional_focal_point', 'super_admin'].includes(role);
}

function resolveCommentVisibility(req, complaint, requestedVisibility) {
  if (req.user.role === 'party_a' || req.user.role === 'party_b') {
    return 'public';
  }

  if (requestedVisibility === 'public' || requestedVisibility === 'internal') {
    return requestedVisibility;
  }

  if (INTERNAL_STATUSES.includes(complaint.status)) {
    return 'internal';
  }

  return 'public';
}

module.exports = {
  checkComplaintAccess,
  checkSectorLeadReviewAccess,
  checkRfpReviewAccess,
  checkComplaintReviewAccess,
  canViewInternalTimeline,
  resolveCommentVisibility,
};

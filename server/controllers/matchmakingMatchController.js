const pool = require('../config/db');
const { getPublicFileUrl } = require('../middleware/upload');
const { enrichProposalRow } = require('../utils/proposalTemplate');
const { resolveSignedStatus, isMouAckExempt } = require('../utils/mouAcknowledgment');
const {
  shouldResetAckOnNewFile,
  getNextVersionNumber,
  insertMouFileVersion,
  listMouFileVersions,
  buildMouStatusWithVersions,
} = require('../utils/mouFileVersions');
const { isMatchDealClosed, MATCH_DEAL_CLOSED_ERROR } = require('../utils/dealClose');
const {
  sectorLeadCoversSector,
  sectorLeadHasAnySector,
} = require('../utils/sectorLeadAssignments');

const MOU_FIELDS = ['mou_scope', 'mou_description', 'mou_sector', 'mou_demand', 'mou_file_url'];
const MOU_STATUSES = new Set(['not_started', 'in_progress', 'uploaded', 'signed', 'deal_closed']);

const MATCH_SELECT = `
  SELECT m.*,
    sa.sector,
    sa.title AS side_a_title,
    sa.country AS side_a_proposal_country,
    sa.status AS side_a_status,
    sa.submitted_by AS party_a_id,
    pa.full_name AS party_a_name,
    pa.email AS party_a_email,
    sb.title AS side_b_title,
    sb.country AS side_b_proposal_country,
    sb.status AS side_b_status,
    sb.submitted_by AS side_b_submitter_id,
    inv.full_name AS side_b_submitter_name,
    inv.email AS side_b_submitter_email,
    matcher.full_name AS matched_by_name,
    dcb.full_name AS deal_closed_by_name,
    dcb.email AS deal_closed_by_email
  FROM mm_matches m
  JOIN mm_proposals sa ON sa.id = m.side_a_proposal_id
  JOIN mm_proposals sb ON sb.id = m.side_b_proposal_id
  JOIN users pa ON pa.id = sa.submitted_by
  JOIN users inv ON inv.id = sb.submitted_by
  LEFT JOIN users matcher ON matcher.id = m.matched_by
  LEFT JOIN users dcb ON dcb.id = m.deal_closed_by
`;

async function getMatchById(id) {
  const [rows] = await pool.query(`${MATCH_SELECT} WHERE m.id = ?`, [id]);
  return rows[0] || null;
}

function formatMatch(row) {
  if (!row) return null;
  return {
    ...row,
    side_a_proposal_id: Number(row.side_a_proposal_id),
    side_b_proposal_id: Number(row.side_b_proposal_id),
    engagement_proposal_id: row.engagement_proposal_id
      ? Number(row.engagement_proposal_id)
      : null,
  };
}

async function getEngagementProposal(engagementProposalId) {
  if (!engagementProposalId) return null;
  const [rows] = await pool.query('SELECT * FROM proposals WHERE id = ?', [engagementProposalId]);
  return rows[0] || null;
}

function matchHasEngagement(match) {
  return Boolean(match?.engagement_proposal_id);
}

function sectorLeadCanAccessMatch(req, match) {
  if (!sectorLeadHasAnySector(req.user)) {
    return { error: 'Sector lead profile has no sector assigned', status: 400 };
  }
  if (match.matched_by === req.user.id || sectorLeadCoversSector(req.user, match.sector)) {
    return { ok: true };
  }
  return { error: 'Access denied — wrong sector', status: 403 };
}

async function verifyMatchEngagementAccess(req, match) {
  if (!match) {
    return { error: 'Match not found', status: 404 };
  }

  if (req.user.role === 'super_admin') {
    return { ok: true, match };
  }

  if (!matchHasEngagement(match)) {
    return { error: 'MOU is only available after match engagement is created', status: 403 };
  }

  if (req.user.role === 'party_a') {
    if (match.party_a_id !== req.user.id) {
      return { error: 'Access denied', status: 403 };
    }
    return { ok: true, match };
  }

  if (req.user.role === 'party_b') {
    const engagement = await getEngagementProposal(match.engagement_proposal_id);
    if (!engagement || engagement.party_b_user_id !== req.user.id) {
      return { error: 'Access denied', status: 403 };
    }
    return { ok: true, match, engagement };
  }

  if (req.user.role === 'investor') {
    const engagement = await getEngagementProposal(match.engagement_proposal_id);
    if (
      engagement?.party_b_user_id === req.user.id ||
      match.side_b_submitter_id === req.user.id
    ) {
      return { ok: true, match, engagement };
    }
    return { error: 'Access denied', status: 403 };
  }

  if (req.user.role === 'sector_lead') {
    const access = sectorLeadCanAccessMatch(req, match);
    if (!access.ok) return access;
    return { ok: true, match };
  }

  if (['focal_point', 'regional_focal_point'].includes(req.user.role)) {
    if (match.matched_by !== req.user.id) {
      return { error: 'Access denied', status: 403 };
    }
    return { ok: true, match, readOnly: true };
  }

  return { error: 'Access denied', status: 403 };
}

function verifyMatchViewAccess(req, match) {
  if (!match) {
    return { error: 'Match not found', status: 404 };
  }

  if (req.user.role === 'super_admin') {
    return { ok: true, match };
  }

  if (req.user.role === 'party_a' && match.party_a_id === req.user.id) {
    return { ok: true, match };
  }

  if (req.user.role === 'sector_lead') {
    const access = sectorLeadCanAccessMatch(req, match);
    if (access.ok) {
      return { ok: true, match };
    }
    return access;
  }

  if (['focal_point', 'regional_focal_point'].includes(req.user.role)) {
    if (match.matched_by === req.user.id) {
      return { ok: true, match };
    }
  }

  if (req.user.role === 'investor' && match.side_b_submitter_id === req.user.id) {
    return { ok: true, match };
  }

  return { error: 'Access denied', status: 403 };
}

async function getMatchDetail(req, res) {
  try {
    const match = await getMatchById(req.params.id);
    const access = verifyMatchViewAccess(req, match);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }
    return res.json(formatMatch(match));
  } catch (err) {
    console.error('MM match detail error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch match' });
  }
}

async function getMatchMou(req, res) {
  try {
    const match = await getMatchById(req.params.id);
    const access = await verifyMatchEngagementAccess(req, match);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const engagement = await getEngagementProposal(match.engagement_proposal_id);
    if (!engagement) {
      return res.status(404).json({ error: 'Engagement proposal not found' });
    }

    const enriched = enrichProposalRow(engagement);
    return res.json({
      match_id: Number(match.id),
      engagement_proposal_id: match.engagement_proposal_id,
      mou_status: match.mou_status || 'not_started',
      mou_uploaded_at: match.mou_uploaded_at,
      mou: {
        mou_scope: enriched.mou_scope,
        mou_description: enriched.mou_description,
        mou_sector: enriched.mou_sector,
        mou_demand: enriched.mou_demand,
        mou_file_url: enriched.mou_file_url,
      },
    });
  } catch (err) {
    console.error('MM get MOU error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch MOU' });
  }
}

async function uploadMatchMou(req, res) {
  try {
    if (['focal_point', 'regional_focal_point'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Focal point has read-only access to MOU' });
    }

    const match = await getMatchById(req.params.id);
    const access = await verifyMatchEngagementAccess(req, match);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!match.engagement_proposal_id) {
      return res.status(400).json({ error: 'Match has no engagement proposal linked' });
    }

    if (isMatchDealClosed(match)) {
      return res.status(400).json({ error: MATCH_DEAL_CLOSED_ERROR });
    }

    const mouFile = req.files?.mou_file?.[0];
    const updates = {};
    MOU_FIELDS.forEach((key) => {
      if (req.body[key] !== undefined && key !== 'mou_file_url') {
        updates[key] = req.body[key];
      }
    });

    if (Object.keys(updates).length === 0 && !mouFile && !req.body.mou_status) {
      return res.status(400).json({ error: 'No MOU fields or file provided' });
    }

    let fileUploadResult = null;

    if (mouFile) {
      const fileUrl = getPublicFileUrl(req, mouFile.filename);
      const matchId = Number(req.params.id);
      const nextVersion = await getNextVersionNumber({ matchId });

      await insertMouFileVersion({
        matchId,
        fileUrl,
        uploadedBy: req.user.id,
        versionNumber: nextVersion,
      });

      await pool.query(
        `UPDATE proposals SET mou_file_url = ?, mou_uploaded_at = NOW(), mou_uploaded_by = ? WHERE id = ?`,
        [fileUrl, req.user.id, match.engagement_proposal_id]
      );

      const ackReset = shouldResetAckOnNewFile(match);
      const matchSetParts = ['mou_status = ?', 'mou_uploaded_at = NOW()', 'mou_uploaded_by = ?'];
      const matchValues = ['uploaded', req.user.id];

      if (ackReset) {
        matchSetParts.push(
          'mou_ack_by_a = FALSE',
          'mou_ack_by_a_at = NULL',
          'mou_ack_by_b = FALSE',
          'mou_ack_by_b_at = NULL'
        );
      }

      matchValues.push(req.params.id);
      await pool.query(
        `UPDATE mm_matches SET ${matchSetParts.join(', ')} WHERE id = ?`,
        matchValues
      );

      fileUploadResult = {
        file_url: fileUrl,
        version: nextVersion,
        ack_reset: ackReset,
        message: ackReset
          ? 'New file uploaded — both parties must re-acknowledge'
          : 'File uploaded',
      };
    }

    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates)
        .map((k) => `${k} = ?`)
        .join(', ');
      await pool.query(`UPDATE proposals SET ${setClause} WHERE id = ?`, [
        ...Object.values(updates),
        match.engagement_proposal_id,
      ]);
    }

    if (!mouFile && (Object.keys(updates).length > 0 || req.body.mou_status)) {
      let mouStatus = req.body.mou_status;
      if (mouStatus && !MOU_STATUSES.has(mouStatus)) {
        return res.status(400).json({ error: 'Invalid mou_status' });
      }
      if (!mouStatus) {
        mouStatus = 'in_progress';
      }

      await pool.query(
        `UPDATE mm_matches SET mou_status = ?, mou_uploaded_at = NOW(), mou_uploaded_by = ? WHERE id = ?`,
        [mouStatus, req.user.id, req.params.id]
      );
    }

    const engagement = await getEngagementProposal(match.engagement_proposal_id);
    const updatedMatch = await getMatchById(req.params.id);

    return res.json({
      message: fileUploadResult?.message || 'MOU saved successfully',
      ...(fileUploadResult || {}),
      match_id: Number(req.params.id),
      engagement_proposal_id: match.engagement_proposal_id,
      mou_status: updatedMatch.mou_status,
      mou_uploaded_at: updatedMatch.mou_uploaded_at,
      proposal: enrichProposalRow(engagement),
    });
  } catch (err) {
    console.error('MM upload MOU error:', err.message);
    return res.status(500).json({ error: 'Failed to save MOU' });
  }
}

async function getMatchMouStatus(req, res) {
  try {
    const match = await getMatchById(req.params.id);
    const access = await verifyMatchEngagementAccess(req, match);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const allowedRoles = new Set(['party_a', 'party_b', 'investor', 'sector_lead', 'super_admin']);
    if (!allowedRoles.has(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const engagement = await getEngagementProposal(match.engagement_proposal_id);
    if (!engagement) {
      return res.status(404).json({ error: 'Engagement proposal not found' });
    }

    const enriched = enrichProposalRow(engagement);
    const status = await buildMouStatusWithVersions(match, enriched.mou_file_url, {
      matchId: Number(match.id),
    });
    return res.json({
      match_id: Number(match.id),
      engagement_proposal_id: match.engagement_proposal_id,
      ...status,
    });
  } catch (err) {
    console.error('MM get MOU status error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch MOU status' });
  }
}

async function acknowledgeMatchMou(req, res) {
  try {
    const match = await getMatchById(req.params.id);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (req.user.role === 'party_a') {
      if (match.party_a_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (req.user.role === 'party_b') {
      const engagement = await getEngagementProposal(match.engagement_proposal_id);
      if (!engagement || engagement.party_b_user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (req.user.role === 'investor') {
      const engagement = await getEngagementProposal(match.engagement_proposal_id);
      if (
        !engagement ||
        (engagement.party_b_user_id !== req.user.id &&
          match.side_b_submitter_id !== req.user.id)
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      return res.status(403).json({ error: 'Only Party A or Party B can acknowledge the MOU' });
    }

    if (!matchHasEngagement(match)) {
      return res.status(400).json({ error: 'MOU acknowledgment is only available after match engagement' });
    }

    if (isMatchDealClosed(match)) {
      return res.status(400).json({ error: MATCH_DEAL_CLOSED_ERROR });
    }

    const engagement = await getEngagementProposal(match.engagement_proposal_id);
    if (!engagement) {
      return res.status(404).json({ error: 'Engagement proposal not found' });
    }

    const enriched = enrichProposalRow(engagement);
    if (!enriched.mou_file_url) {
      return res.status(400).json({ error: 'MOU file not uploaded yet' });
    }

    if (isMouAckExempt(match)) {
      return res.status(400).json({
        error: 'Acknowledgment is not required for historic MOU records',
      });
    }

    if (req.user.role === 'party_a' && match.mou_ack_by_a) {
      return res.status(400).json({ error: 'Already acknowledged' });
    }
    if (
      (req.user.role === 'party_b' || req.user.role === 'investor') &&
      match.mou_ack_by_b
    ) {
      return res.status(400).json({ error: 'Already acknowledged' });
    }

    if (req.user.role === 'party_a') {
      await pool.query(
        `UPDATE mm_matches SET mou_ack_by_a = 1, mou_ack_by_a_at = NOW() WHERE id = ?`,
        [req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE mm_matches SET mou_ack_by_b = 1, mou_ack_by_b_at = NOW() WHERE id = ?`,
        [req.params.id]
      );
    }

    const updatedMatch = await getMatchById(req.params.id);
    const ackA = Boolean(updatedMatch.mou_ack_by_a);
    const ackB = Boolean(updatedMatch.mou_ack_by_b);
    const nextStatus = resolveSignedStatus(ackA, ackB, updatedMatch.mou_status);

    if (nextStatus === 'signed' && updatedMatch.mou_status !== 'signed') {
      await pool.query(`UPDATE mm_matches SET mou_status = 'signed' WHERE id = ?`, [req.params.id]);
      updatedMatch.mou_status = 'signed';
    }

    const enrichedUpdated = enrichProposalRow(engagement);
    const status = await buildMouStatusWithVersions(updatedMatch, enrichedUpdated.mou_file_url, {
      matchId: Number(updatedMatch.id),
    });
    return res.json({
      message: 'MOU acknowledged successfully',
      match_id: Number(updatedMatch.id),
      engagement_proposal_id: updatedMatch.engagement_proposal_id,
      ...status,
    });
  } catch (err) {
    console.error('MM acknowledge MOU error:', err.message);
    return res.status(500).json({ error: 'Failed to acknowledge MOU' });
  }
}

async function getMatchByEngagement(req, res) {
  try {
    const engagementId = Number(req.params.engagementProposalId);
    const [rows] = await pool.query(
      `${MATCH_SELECT} WHERE m.engagement_proposal_id = ?`,
      [engagementId]
    );
    const match = rows[0];
    if (!match) {
      return res.status(404).json({ error: 'Match not found for this engagement' });
    }

    const access = await verifyMatchEngagementAccess(req, match);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    return res.json(formatMatch(match));
  } catch (err) {
    console.error('MM match by engagement error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch match' });
  }
}

async function getMatchMouVersions(req, res) {
  try {
    const match = await getMatchById(req.params.id);
    const access = await verifyMatchEngagementAccess(req, match);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const allowedRoles = new Set(['party_a', 'party_b', 'investor', 'sector_lead', 'super_admin']);
    if (!allowedRoles.has(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const versions = await listMouFileVersions({ matchId: Number(req.params.id) });
    return res.json({
      match_id: Number(req.params.id),
      versions,
    });
  } catch (err) {
    console.error('MM get MOU versions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch MOU versions' });
  }
}

module.exports = {
  MATCH_SELECT,
  getMatchById,
  formatMatch,
  getMatchDetail,
  getMatchMou,
  uploadMatchMou,
  getMatchMouStatus,
  acknowledgeMatchMou,
  getMatchMouVersions,
  getMatchByEngagement,
};

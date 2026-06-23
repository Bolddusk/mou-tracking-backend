const pool = require('../config/db');
const { getPublicFileUrl } = require('../middleware/upload');
const {
  checkProposalAccess,
  buildProposalCapabilities,
} = require('../utils/proposalAccess');
const { enrichProposalRow } = require('../utils/proposalTemplate');
const { formatMouAckStatus, resolveSignedStatus } = require('../utils/mouAcknowledgment');
const {
  shouldResetAckOnNewFile,
  getNextVersionNumber,
  insertMouFileVersion,
  listMouFileVersions,
  buildMouStatusWithVersions,
} = require('../utils/mouFileVersions');
const { isProposalLocked, PROPOSAL_LOCKED_ERROR } = require('../utils/dealClose');
const { getMatchForEngagement } = require('../utils/proposalAccess');

const MOU_FIELDS = ['mou_scope', 'mou_description', 'mou_sector', 'mou_demand', 'mou_file_url'];
const MOU_STATUSES = new Set(['not_started', 'in_progress', 'uploaded', 'signed', 'deal_closed']);

const PROPOSAL_SELECT = `
  SELECT p.*,
    pa.full_name AS party_a_name,
    pa.email AS party_a_email,
    dcb.full_name AS deal_closed_by_name
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
  LEFT JOIN users dcb ON dcb.id = p.deal_closed_by
`;

async function getProposalRow(proposalId) {
  const [rows] = await pool.query(`${PROPOSAL_SELECT} WHERE p.id = ?`, [proposalId]);
  return rows[0] || null;
}

function resolveMouStatus(proposal) {
  if (proposal.mou_status && proposal.mou_status !== 'not_started') {
    return proposal.mou_status;
  }
  if (proposal.mou_file_url) return 'uploaded';
  if (proposal.mou_scope) return 'in_progress';
  return 'not_started';
}

function formatMouResponse(proposal) {
  const enriched = enrichProposalRow(proposal);
  return {
    proposal_id: Number(proposal.id),
    mou_status: resolveMouStatus(proposal),
    mou_uploaded_at: proposal.mou_uploaded_at,
    mou: {
      mou_scope: enriched.mou_scope,
      mou_description: enriched.mou_description,
      mou_sector: enriched.mou_sector,
      mou_demand: enriched.mou_demand,
      mou_file_url: enriched.mou_file_url,
    },
  };
}

async function getProposalMou(req, res) {
  try {
    const proposal = await getProposalRow(req.params.id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const caps = buildProposalCapabilities(req, proposal, access);
    if (!caps.can_view_mou) {
      return res.status(403).json({ error: 'MOU is not available for this opportunity' });
    }

    return res.json(formatMouResponse(proposal));
  } catch (err) {
    console.error('Get proposal MOU error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch MOU' });
  }
}

async function saveProposalMou(req, res) {
  try {
    if (req.user.role === 'regional_focal_point') {
      return res.status(403).json({ error: 'Regional Focal Point has read-only access to MOU' });
    }

    const proposal = await getProposalRow(req.params.id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const caps = buildProposalCapabilities(req, proposal, access);
    if (!caps.can_upload_mou) {
      return res.status(403).json({ error: 'You cannot update MOU on this opportunity' });
    }

    if (isProposalLocked(proposal)) {
      return res.status(400).json({ error: PROPOSAL_LOCKED_ERROR });
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
      const nextVersion = await getNextVersionNumber({ proposalId: Number(req.params.id) });

      await insertMouFileVersion({
        proposalId: Number(req.params.id),
        fileUrl,
        uploadedBy: req.user.id,
        versionNumber: nextVersion,
      });

      const ackReset = shouldResetAckOnNewFile(proposal);
      const setParts = [
        'mou_file_url = ?',
        'mou_uploaded_at = NOW()',
        'mou_uploaded_by = ?',
        'mou_status = ?',
      ];
      const values = [fileUrl, req.user.id, 'uploaded'];

      if (ackReset) {
        setParts.push(
          'mou_ack_by_a = FALSE',
          'mou_ack_by_a_at = NULL',
          'mou_ack_by_b = FALSE',
          'mou_ack_by_b_at = NULL'
        );
      }

      values.push(req.params.id);
      await pool.query(`UPDATE proposals SET ${setParts.join(', ')} WHERE id = ?`, values);

      fileUploadResult = {
        file_url: fileUrl,
        version: nextVersion,
        ack_reset: ackReset,
        message: ackReset
          ? 'New file uploaded — both parties must re-acknowledge'
          : 'File uploaded',
      };
    }

    if (Object.keys(updates).length > 0 || (!mouFile && req.body.mou_status)) {
      let mouStatus = req.body.mou_status;
      if (mouStatus && !MOU_STATUSES.has(mouStatus)) {
        return res.status(400).json({ error: 'Invalid mou_status' });
      }
      if (!mouStatus && !mouFile) {
        mouStatus = 'in_progress';
      }

      const setParts = [];
      const values = [];

      if (!mouFile) {
        setParts.push('mou_uploaded_at = NOW()', 'mou_uploaded_by = ?');
        values.push(req.user.id);
      }

      if (mouStatus && !mouFile) {
        setParts.push('mou_status = ?');
        values.push(mouStatus);
      }

      Object.entries(updates).forEach(([key, val]) => {
        setParts.push(`${key} = ?`);
        values.push(val);
      });

      if (setParts.length > 0) {
        values.push(req.params.id);
        await pool.query(`UPDATE proposals SET ${setParts.join(', ')} WHERE id = ?`, values);
      }
    }

    const updated = await getProposalRow(req.params.id);
    return res.json({
      message: fileUploadResult?.message || 'MOU saved successfully',
      ...(fileUploadResult || {}),
      ...formatMouResponse(updated),
      proposal: enrichProposalRow(updated),
    });
  } catch (err) {
    console.error('Save proposal MOU error:', err.message);
    return res.status(500).json({ error: 'Failed to save MOU' });
  }
}

async function getProposalMouStatus(req, res) {
  try {
    const proposal = await getProposalRow(req.params.id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const allowedRoles = new Set(['party_a', 'party_b', 'investor', 'sector_lead', 'super_admin']);
    if (!allowedRoles.has(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const caps = buildProposalCapabilities(req, proposal, access);
    if (!caps.can_view_mou) {
      return res.status(403).json({ error: 'MOU is not available for this opportunity' });
    }

    const enriched = enrichProposalRow(proposal);
    const match = await getMatchForEngagement(proposal.id);
    const ackSource = match || proposal;
    const mouFileUrl = enriched.mou_file_url;
    const status = await buildMouStatusWithVersions(ackSource, mouFileUrl, {
      proposalId: match ? null : Number(proposal.id),
      matchId: match ? Number(match.id) : null,
    });
    return res.json({
      proposal_id: Number(proposal.id),
      match_id: match ? Number(match.id) : null,
      ...status,
      mou_status: match?.mou_status ?? status.mou_status,
    });
  } catch (err) {
    console.error('Get proposal MOU status error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch MOU status' });
  }
}

async function acknowledgeProposalMou(req, res) {
  try {
    const proposal = await getProposalRow(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (req.user.role === 'party_a') {
      if (proposal.party_a_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (req.user.role === 'party_b') {
      if (proposal.party_b_user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (req.user.role === 'investor') {
      if (proposal.party_b_user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else {
      return res.status(403).json({ error: 'Only Party A or Party B can acknowledge the MOU' });
    }

    if (proposal.status !== 'approved') {
      return res.status(400).json({ error: 'MOU acknowledgment is only available after approval' });
    }

    if (isProposalLocked(proposal)) {
      return res.status(400).json({ error: PROPOSAL_LOCKED_ERROR });
    }

    const enriched = enrichProposalRow(proposal);
    if (!enriched.mou_file_url) {
      return res.status(400).json({ error: 'MOU file not uploaded yet' });
    }

    const match = await getMatchForEngagement(proposal.id);

    if (match) {
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
          [match.id]
        );
      } else {
        await pool.query(
          `UPDATE mm_matches SET mou_ack_by_b = 1, mou_ack_by_b_at = NOW() WHERE id = ?`,
          [match.id]
        );
      }

      const [updatedMatchRows] = await pool.query('SELECT * FROM mm_matches WHERE id = ?', [
        match.id,
      ]);
      const updatedMatch = updatedMatchRows[0];
      const ackA = Boolean(updatedMatch.mou_ack_by_a);
      const ackB = Boolean(updatedMatch.mou_ack_by_b);
      const nextStatus = resolveSignedStatus(ackA, ackB, updatedMatch.mou_status);

      if (nextStatus === 'signed' && updatedMatch.mou_status !== 'signed') {
        await pool.query(`UPDATE mm_matches SET mou_status = 'signed' WHERE id = ?`, [match.id]);
        updatedMatch.mou_status = 'signed';
      }

      const status = await buildMouStatusWithVersions(updatedMatch, enriched.mou_file_url, {
        matchId: Number(match.id),
      });
      return res.json({
        message: 'MOU acknowledged successfully',
        proposal_id: Number(proposal.id),
        match_id: Number(match.id),
        ...status,
        mou_status: updatedMatch.mou_status,
      });
    }

    if (req.user.role === 'party_a' && proposal.mou_ack_by_a) {
      return res.status(400).json({ error: 'Already acknowledged' });
    }
    if (req.user.role === 'party_b' && proposal.mou_ack_by_b) {
      return res.status(400).json({ error: 'Already acknowledged' });
    }

    if (req.user.role === 'party_a') {
      await pool.query(
        `UPDATE proposals SET mou_ack_by_a = 1, mou_ack_by_a_at = NOW() WHERE id = ?`,
        [req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE proposals SET mou_ack_by_b = 1, mou_ack_by_b_at = NOW() WHERE id = ?`,
        [req.params.id]
      );
    }

    const updated = await getProposalRow(req.params.id);
    const ackA = Boolean(updated.mou_ack_by_a);
    const ackB = Boolean(updated.mou_ack_by_b);
    const nextStatus = resolveSignedStatus(ackA, ackB, updated.mou_status);

    if (nextStatus === 'signed' && updated.mou_status !== 'signed') {
      await pool.query(`UPDATE proposals SET mou_status = 'signed' WHERE id = ?`, [req.params.id]);
      updated.mou_status = 'signed';
    }

    const enrichedUpdated = enrichProposalRow(updated);
    const status = await buildMouStatusWithVersions(updated, enrichedUpdated.mou_file_url, {
      proposalId: Number(updated.id),
    });
    return res.json({
      message: 'MOU acknowledged successfully',
      proposal_id: Number(updated.id),
      ...status,
    });
  } catch (err) {
    console.error('Acknowledge proposal MOU error:', err.message);
    return res.status(500).json({ error: 'Failed to acknowledge MOU' });
  }
}

async function getProposalMouVersions(req, res) {
  try {
    const proposal = await getProposalRow(req.params.id);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const allowedRoles = new Set(['party_a', 'party_b', 'investor', 'sector_lead', 'super_admin']);
    if (!allowedRoles.has(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const caps = buildProposalCapabilities(req, proposal, access);
    if (!caps.can_view_mou) {
      return res.status(403).json({ error: 'MOU is not available for this opportunity' });
    }

    const versions = await listMouFileVersions({ proposalId: Number(req.params.id) });
    return res.json({
      proposal_id: Number(req.params.id),
      versions,
    });
  } catch (err) {
    console.error('Get proposal MOU versions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch MOU versions' });
  }
}

module.exports = {
  getProposalMou,
  saveProposalMou,
  getProposalMouStatus,
  acknowledgeProposalMou,
  getProposalMouVersions,
};

const pool = require('../config/db');
const { getPublicFileUrl } = require('../middleware/upload');
const { attachPokeStatus } = require('../utils/pokeStatus');
const {
  enrichProposals,
  enrichProposalRow,
  buildDraftUpdates,
  validateSubmit,
  hasMeaningfulProposalDraft,
} = require('../utils/proposalTemplate');

async function getOwnedProposal(proposalId, user) {
  const [rows] = await pool.query('SELECT * FROM proposals WHERE id = ?', [proposalId]);
  const proposal = rows[0] || null;
  if (!proposal) return null;
  if (user.role === 'super_admin') return proposal;
  if (proposal.party_a_id === user.id) return proposal;
  return null;
}

async function saveDraft(req, res) {
  try {
    const { proposal_id: proposalId, ...body } = req.body;
    const updates = buildDraftUpdates(body);

    if (proposalId) {
      const existing = await getOwnedProposal(proposalId, req.user);
      if (existing) {
        if (
          req.user.role !== 'super_admin' &&
          !['draft', 'rejected'].includes(existing.status)
        ) {
          return res.status(400).json({ error: 'Only draft proposals can be edited' });
        }

        if (Object.keys(updates).length > 0) {
          const setClause = Object.keys(updates)
            .map((k) => `${k} = ?`)
            .join(', ');
          await pool.query(`UPDATE proposals SET ${setClause} WHERE id = ?`, [
            ...Object.values(updates),
            proposalId,
          ]);
        }

        const [rows] = await pool.query('SELECT status FROM proposals WHERE id = ?', [proposalId]);
        return res.json({ proposal_id: Number(proposalId), status: rows[0]?.status || existing.status });
      }
      // Stale client id (e.g. after demo reset) — create a fresh draft below
    }

    if (!hasMeaningfulProposalDraft(body)) {
      return res.status(400).json({
        error:
          'Nothing to save yet. Enter form details, then use Save as Draft or Save & Next.',
      });
    }

    const cols = ['party_a_id', 'status', ...Object.keys(updates)];
    const placeholders = cols.map(() => '?').join(', ');
    const values = [req.user.id, 'draft', ...Object.values(updates)];

    const [result] = await pool.query(
      `INSERT INTO proposals (${cols.join(', ')}) VALUES (${placeholders})`,
      values
    );

    return res.status(201).json({
      proposal_id: result.insertId,
      status: 'draft',
    });
  } catch (err) {
    console.error('Save draft error:', err.message);
    return res.status(500).json({ error: 'Failed to save draft' });
  }
}

async function submitProposal(req, res) {
  try {
    const { proposal_id: proposalId } = req.body;

    if (!proposalId) {
      return res.status(400).json({ error: 'proposal_id is required' });
    }

    const proposal = await getOwnedProposal(proposalId, req.user);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.status !== 'draft') {
      return res.status(400).json({ error: 'Proposal already submitted' });
    }

    const missing = validateSubmit(proposal);

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missing_fields: missing,
      });
    }

    await pool.query(
      `UPDATE proposals SET status = 'submitted', submitted_at = NOW() WHERE id = ?`,
      [proposalId]
    );

    return res.json({
      proposal_id: Number(proposalId),
      status: 'submitted',
      message: 'Proposal sent to sector lead for review',
    });
  } catch (err) {
    console.error('Submit proposal error:', err.message);
    return res.status(500).json({ error: 'Failed to submit proposal' });
  }
}

async function resubmitProposal(req, res) {
  try {
    const proposal = await getOwnedProposal(req.params.id, req.user);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.party_a_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (proposal.status !== 'rejected') {
      return res.status(400).json({ error: 'Only rejected proposals can be resubmitted' });
    }

    const missing = validateSubmit(proposal);
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing fields',
        fields: missing,
      });
    }

    await pool.query(
      `UPDATE proposals
       SET status = 'resubmitted',
           resubmit_count = resubmit_count + 1,
           last_resubmitted_at = NOW(),
           submitted_at = NOW()
       WHERE id = ?`,
      [req.params.id]
    );

    const [rows] = await pool.query('SELECT * FROM proposals WHERE id = ?', [req.params.id]);
    const updated = enrichProposalRow(rows[0]);

    return res.json({
      message: 'Proposal resubmitted for sector lead review',
      proposal: updated,
    });
  } catch (err) {
    console.error('Resubmit proposal error:', err.message);
    return res.status(500).json({ error: 'Failed to resubmit proposal' });
  }
}

async function uploadFile(req, res) {
  try {
    const proposalFile = req.files?.proposal_file?.[0];
    const mouFile = req.files?.mou_file?.[0];
    const logoFile = req.files?.company_logo?.[0];
    const coverFile = req.files?.cover_image?.[0];
    const file = proposalFile || mouFile || logoFile || coverFile;

    if (!file) {
      return res.status(400).json({
        error: 'No file uploaded. Use proposal_file, mou_file, company_logo, or cover_image',
      });
    }

    const file_url = getPublicFileUrl(req, file.filename);
    let field = 'proposal_file';
    if (mouFile) field = 'mou_file';
    if (logoFile) field = 'company_logo';
    if (coverFile) field = 'cover_image';

    return res.json({ file_url, field });
  } catch (err) {
    console.error('Upload error:', err.message);
    return res.status(500).json({ error: 'File upload failed' });
  }
}

async function getMyProposals(req, res) {
  try {
    let rows;

    if (req.user.role === 'party_b') {
      [rows] = await pool.query(
        'SELECT * FROM proposals WHERE party_b_user_id = ? ORDER BY created_at DESC',
        [req.user.id]
      );
    } else if (req.user.role === 'investor') {
      // Matchmaking engagements provision Party B using the investor account email.
      [rows] = await pool.query(
        'SELECT * FROM proposals WHERE party_b_user_id = ? ORDER BY created_at DESC',
        [req.user.id]
      );
    } else {
      [rows] = await pool.query(
        'SELECT * FROM proposals WHERE party_a_id = ? ORDER BY created_at DESC',
        [req.user.id]
      );
    }

    const enriched = enrichProposals(rows);
    const withPoke = await attachPokeStatus(enriched);
    return res.json(withPoke);
  } catch (err) {
    console.error('Get my proposals error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch proposals' });
  }
}

async function deleteProposal(req, res) {
  try {
    const proposal = await getOwnedProposal(req.params.id, req.user);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (!['draft', 'rejected'].includes(proposal.status)) {
      return res.status(400).json({
        error: 'Only draft or rejected proposals can be deleted',
      });
    }

    await pool.query('DELETE FROM proposals WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Proposal deleted', id: Number(req.params.id) });
  } catch (err) {
    console.error('Delete proposal error:', err.message);
    return res.status(500).json({ error: 'Failed to delete proposal' });
  }
}

module.exports = {
  saveDraft,
  submitProposal,
  resubmitProposal,
  uploadFile,
  getMyProposals,
  deleteProposal,
  enrichProposalRow,
};

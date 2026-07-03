const pool = require('../config/db');
const { getActiveSectorNames, ensureSectorCache } = require('../utils/sectorRegistry');
const {
  userIsAssignedToSector,
  getSectorLeadUserIdsForSector,
  listSectorLeadsWithAssignments,
  getAssignmentsForUser,
  replaceAssignments,
} = require('../utils/sectorLeadAssignments');

const COMPLAINT_CLOSED = ['resolved', 'rejected'];
const MM_PROPOSAL_CLOSED = ['matched', 'rejected'];

async function getSectorLeadById(userId) {
  const [rows] = await pool.query(
    `SELECT id, full_name, email, role, sector FROM users WHERE id = ?`,
    [userId]
  );
  return rows[0] || null;
}

async function reassignSectorLead(req, res) {
  try {
    await ensureSectorCache();
    const activeSectors = getActiveSectorNames();
    const sector = String(req.body.sector || '').trim();
    const newSlUserId = Number(req.body.new_sl_user_id);
    const reason = req.body.reason?.trim() || null;

    if (!sector) {
      return res.status(400).json({ error: 'sector is required' });
    }
    if (!newSlUserId) {
      return res.status(400).json({ error: 'new_sl_user_id is required' });
    }
    if (!activeSectors.includes(sector)) {
      return res.status(400).json({ error: `Invalid sector. Allowed: ${activeSectors.join(', ')}` });
    }

    const newSl = await getSectorLeadById(newSlUserId);
    if (!newSl || newSl.role !== 'sector_lead') {
      return res.status(400).json({ error: 'new_sl_user_id must be a valid Sector Lead user' });
    }
    if (!(await userIsAssignedToSector(newSlUserId, sector))) {
      return res.status(400).json({
        error: 'New Sector Lead is not assigned to the requested sector',
        requested_sector: sector,
      });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const oldSlIds = await getSectorLeadUserIdsForSector(sector, newSlUserId, connection);

      let complaintsUpdated = 0;
      let mmProposalsUpdated = 0;
      let orphanComplaintsFixed = 0;
      let orphanMmProposalsFixed = 0;

      if (oldSlIds.length > 0) {
        const placeholders = oldSlIds.map(() => '?').join(', ');
        const complaintClosedPlaceholders = COMPLAINT_CLOSED.map(() => '?').join(', ');

        const [complaintResult] = await connection.query(
          `UPDATE complaints SET tagged_sector_lead = ?
           WHERE tagged_sector_lead IN (${placeholders})
             AND status NOT IN (${complaintClosedPlaceholders})`,
          [newSlUserId, ...oldSlIds, ...COMPLAINT_CLOSED]
        );
        complaintsUpdated = complaintResult.affectedRows;

        const mmClosedPlaceholders = MM_PROPOSAL_CLOSED.map(() => '?').join(', ');
        const [mmResult] = await connection.query(
          `UPDATE mm_proposals SET forwarded_to = ?
           WHERE forwarded_to IN (${placeholders})
             AND status NOT IN (${mmClosedPlaceholders})`,
          [newSlUserId, ...oldSlIds, ...MM_PROPOSAL_CLOSED]
        );
        mmProposalsUpdated = mmResult.affectedRows;
      }

      // Orphans: tagged user missing or no longer sector_lead (e.g. demoted/deleted)
      const complaintClosedPh = COMPLAINT_CLOSED.map(() => '?').join(', ');
      const [orphanComplaintResult] = await connection.query(
        `UPDATE complaints c
         JOIN proposals p ON p.id = c.proposal_id
         LEFT JOIN users u ON u.id = c.tagged_sector_lead
         SET c.tagged_sector_lead = ?
         WHERE p.sector = ?
           AND c.status NOT IN (${complaintClosedPh})
           AND (u.id IS NULL OR u.role != 'sector_lead')`,
        [newSlUserId, sector, ...COMPLAINT_CLOSED]
      );
      orphanComplaintsFixed = orphanComplaintResult.affectedRows;

      const mmClosedPh = MM_PROPOSAL_CLOSED.map(() => '?').join(', ');
      const [orphanMmResult] = await connection.query(
        `UPDATE mm_proposals p
         LEFT JOIN users u ON u.id = p.forwarded_to
         SET p.forwarded_to = ?
         WHERE p.sector = ?
           AND p.forwarded_to IS NOT NULL
           AND p.status NOT IN (${mmClosedPh})
           AND (u.id IS NULL OR u.role NOT IN ('sector_lead', 'focal_point', 'regional_focal_point'))`,
        [newSlUserId, sector, ...MM_PROPOSAL_CLOSED]
      );
      orphanMmProposalsFixed = orphanMmResult.affectedRows;

      if (oldSlIds.length === 0) {
        await connection.query(
          `INSERT INTO sl_reassignments (from_user_id, to_user_id, sector, reassigned_by, reason)
           VALUES (NULL, ?, ?, ?, ?)`,
          [newSlUserId, sector, req.user.id, reason]
        );
      } else {
        for (const oldId of oldSlIds) {
          await connection.query(
            `INSERT INTO sl_reassignments (from_user_id, to_user_id, sector, reassigned_by, reason)
             VALUES (?, ?, ?, ?, ?)`,
            [oldId, newSlUserId, sector, req.user.id, reason]
          );
        }
      }

      await connection.commit();

      return res.json({
        message: 'Sector Lead reassigned',
        complaints_updated: complaintsUpdated,
        mm_proposals_updated: mmProposalsUpdated,
        orphan_complaints_fixed: orphanComplaintsFixed,
        orphan_mm_proposals_fixed: orphanMmProposalsFixed,
        sector,
        new_sector_lead: {
          id: newSl.id,
          full_name: newSl.full_name,
          email: newSl.email,
        },
        previous_sector_lead_ids: oldSlIds,
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Reassign sector lead error:', err.message);
    return res.status(500).json({ error: 'Failed to reassign Sector Lead' });
  }
}

async function getReassignments(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT r.id,
              r.from_user_id,
              fu.full_name AS from_user_name,
              fu.email AS from_user_email,
              r.to_user_id,
              tu.full_name AS to_user_name,
              tu.email AS to_user_email,
              r.sector,
              r.reason,
              r.reassigned_at,
              r.reassigned_by,
              rb.full_name AS reassigned_by_name
       FROM sl_reassignments r
       LEFT JOIN users fu ON fu.id = r.from_user_id
       JOIN users tu ON tu.id = r.to_user_id
       JOIN users rb ON rb.id = r.reassigned_by
       ORDER BY r.reassigned_at DESC`
    );
    return res.json({ reassignments: rows, count: rows.length });
  } catch (err) {
    console.error('Get reassignments error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch reassignment history' });
  }
}

async function getOrphans(req, res) {
  try {
    const [orphanComplaints] = await pool.query(
      `SELECT c.id, c.title, c.status, c.tagged_sector_lead,
              u.full_name AS tagged_user_name, u.role AS tagged_user_role, u.sector AS tagged_user_sector
       FROM complaints c
       LEFT JOIN users u ON u.id = c.tagged_sector_lead
       WHERE u.id IS NULL OR u.role != 'sector_lead'
       ORDER BY c.created_at DESC`
    );

    const [orphanMmProposals] = await pool.query(
      `SELECT p.id, p.title, p.sector, p.status, p.forwarded_to,
              u.full_name AS forwarded_to_name, u.role AS forwarded_to_role, u.sector AS forwarded_to_sector
       FROM mm_proposals p
       LEFT JOIN users u ON u.id = p.forwarded_to
       WHERE p.forwarded_to IS NOT NULL
         AND (u.id IS NULL OR u.role NOT IN ('sector_lead', 'focal_point', 'regional_focal_point'))
       ORDER BY p.forwarded_at DESC`
    );

    return res.json({
      orphan_complaints: orphanComplaints,
      orphan_mm_proposals: orphanMmProposals,
      counts: {
        orphan_complaints: orphanComplaints.length,
        orphan_mm_proposals: orphanMmProposals.length,
      },
    });
  } catch (err) {
    console.error('Get orphans error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch orphan records' });
  }
}

async function listSectorLeadsAdmin(req, res) {
  try {
    const sector = req.query.sector?.trim() || null;
    const leads = await listSectorLeadsWithAssignments(sector);
    return res.json({ sector_leads: leads, count: leads.length });
  } catch (err) {
    console.error('List sector leads error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sector leads' });
  }
}

async function getSectorLeadSectorsAdmin(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await getSectorLeadById(userId);
    if (!user || user.role !== 'sector_lead') {
      return res.status(404).json({ error: 'Sector Lead user not found' });
    }

    const assignments = await getAssignmentsForUser(userId);
    return res.json({
      user_id: userId,
      full_name: user.full_name,
      email: user.email,
      primary_sector: assignments.find((a) => a.is_primary)?.sector || assignments[0]?.sector || user.sector,
      sectors: assignments.map((a) => a.sector),
      assignments,
    });
  } catch (err) {
    console.error('Get sector lead sectors error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sector assignments' });
  }
}

async function putSectorLeadSectorsAdmin(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await getSectorLeadById(userId);
    if (!user || user.role !== 'sector_lead') {
      return res.status(404).json({ error: 'Sector Lead user not found' });
    }

    const sectors = Array.isArray(req.body.sectors) ? req.body.sectors : null;
    if (!sectors?.length) {
      return res.status(400).json({ error: 'sectors array is required (at least one sector)' });
    }

    const result = await replaceAssignments(userId, sectors, {
      primarySector: req.body.primary_sector || null,
      assignedBy: req.user.id,
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({
      message: 'Sector assignments updated',
      user_id: userId,
      primary_sector: result.primary_sector,
      sectors: result.sectors,
      assignments: result.assignments,
    });
  } catch (err) {
    console.error('Put sector lead sectors error:', err.message);
    return res.status(500).json({ error: 'Failed to update sector assignments' });
  }
}

module.exports = {
  reassignSectorLead,
  getReassignments,
  getOrphans,
  listSectorLeadsAdmin,
  getSectorLeadSectorsAdmin,
  putSectorLeadSectorsAdmin,
};


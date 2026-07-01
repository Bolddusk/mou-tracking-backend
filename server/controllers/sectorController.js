const {
  listActiveSectors,
  listAllSectorsAdmin,
  getSectorRowById,
  getSectorUsage,
  createSector,
  updateSector,
  deleteSector,
  formatSectorRow,
} = require('../utils/sectorRegistry');

async function getActiveSectors(req, res) {
  try {
    const sectors = await listActiveSectors();
    return res.json({
      sectors: sectors.map((row) => row.name),
      items: sectors,
      count: sectors.length,
    });
  } catch (err) {
    console.error('List active sectors error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sectors' });
  }
}

async function adminListSectors(req, res) {
  try {
    const sectors = await listAllSectorsAdmin();
    return res.json({ sectors, count: sectors.length });
  } catch (err) {
    console.error('Admin list sectors error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sectors' });
  }
}

async function adminGetSector(req, res) {
  try {
    const row = await getSectorRowById(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    const usage = await getSectorUsage(row.name);
    return res.json({ sector: formatSectorRow(row, usage) });
  } catch (err) {
    console.error('Admin get sector error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sector' });
  }
}

async function adminCreateSector(req, res) {
  try {
    const result = await createSector(req.body.name, req.body.sort_order);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(201).json({
      message: 'Sector created',
      sector: result.sector,
    });
  } catch (err) {
    console.error('Create sector error:', err.message);
    return res.status(500).json({ error: 'Failed to create sector' });
  }
}

async function adminUpdateSector(req, res) {
  try {
    const result = await updateSector(req.params.id, req.body);
    if (result.error) {
      const payload = { error: result.error };
      if (result.usage) payload.usage = result.usage;
      return res.status(result.status).json(payload);
    }
    return res.json({
      message: 'Sector updated',
      sector: result.sector,
    });
  } catch (err) {
    console.error('Update sector error:', err.message);
    return res.status(500).json({ error: 'Failed to update sector' });
  }
}

async function adminDeleteSector(req, res) {
  try {
    const result = await deleteSector(req.params.id);
    if (result.error) {
      const payload = { error: result.error };
      if (result.usage) payload.usage = result.usage;
      return res.status(result.status).json(payload);
    }
    return res.json(result);
  } catch (err) {
    console.error('Delete sector error:', err.message);
    return res.status(500).json({ error: 'Failed to delete sector' });
  }
}

module.exports = {
  getActiveSectors,
  adminListSectors,
  adminGetSector,
  adminCreateSector,
  adminUpdateSector,
  adminDeleteSector,
};

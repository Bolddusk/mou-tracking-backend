const {
  listActiveSifcCategories,
  listAllSifcCategoriesAdmin,
  getSifcCategoryRowById,
  getSifcCategoryUsage,
  createSifcCategory,
  updateSifcCategory,
  deleteSifcCategory,
  formatSifcCategoryRow,
} = require('../utils/sifcCategoryRegistry');

async function getActiveSifcCategories(req, res) {
  try {
    const categories = await listActiveSifcCategories();
    return res.json({
      categories,
      items: categories,
      names: categories.map((row) => row.name),
      count: categories.length,
    });
  } catch (err) {
    console.error('List active SIFC categories error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch SIFC categories' });
  }
}

async function adminListSifcCategories(req, res) {
  try {
    const categories = await listAllSifcCategoriesAdmin();
    return res.json({ categories, count: categories.length });
  } catch (err) {
    console.error('Admin list SIFC categories error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch SIFC categories' });
  }
}

async function adminGetSifcCategory(req, res) {
  try {
    const row = await getSifcCategoryRowById(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'SIFC category not found' });
    }
    const usage = await getSifcCategoryUsage(row.name);
    return res.json({ category: formatSifcCategoryRow(row, usage) });
  } catch (err) {
    console.error('Admin get SIFC category error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch SIFC category' });
  }
}

async function adminCreateSifcCategory(req, res) {
  try {
    const result = await createSifcCategory(req.body.name, req.body.sort_order);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(201).json({
      message: 'SIFC category created',
      category: result.category,
    });
  } catch (err) {
    console.error('Create SIFC category error:', err.message);
    return res.status(500).json({ error: 'Failed to create SIFC category' });
  }
}

async function adminUpdateSifcCategory(req, res) {
  try {
    const result = await updateSifcCategory(req.params.id, req.body);
    if (result.error) {
      const payload = { error: result.error };
      if (result.usage) payload.usage = result.usage;
      return res.status(result.status).json(payload);
    }
    return res.json({
      message: 'SIFC category updated',
      category: result.category,
    });
  } catch (err) {
    console.error('Update SIFC category error:', err.message);
    return res.status(500).json({ error: 'Failed to update SIFC category' });
  }
}

async function adminDeleteSifcCategory(req, res) {
  try {
    const result = await deleteSifcCategory(req.params.id);
    if (result.error) {
      const payload = { error: result.error };
      if (result.usage) payload.usage = result.usage;
      return res.status(result.status).json(payload);
    }
    return res.json(result);
  } catch (err) {
    console.error('Delete SIFC category error:', err.message);
    return res.status(500).json({ error: 'Failed to delete SIFC category' });
  }
}

module.exports = {
  getActiveSifcCategories,
  adminListSifcCategories,
  adminGetSifcCategory,
  adminCreateSifcCategory,
  adminUpdateSifcCategory,
  adminDeleteSifcCategory,
};

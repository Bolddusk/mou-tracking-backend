const { SECTORS } = require('../constants/sectors');
const { DEFAULT_SIFC_CATEGORIES } = require('../constants/sifcCategories');

const SECTOR_ALIASES = {
  'fisheries & aquaculture (including processing)':
    'Fisheries & Aquaculture (Including Processing)',
};

function normalizeSectorName(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  const alias = SECTOR_ALIASES[value.toLowerCase()];
  if (alias) return alias;

  const exact = SECTORS.find((s) => s === value);
  if (exact) return exact;

  const ci = SECTORS.find((s) => s.toLowerCase() === value.toLowerCase());
  if (ci) return ci;

  return value;
}

function normalizeSifcCategory(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  const key = value
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const map = {
    bilteral: 'Bilteral',
    bilateral: 'Bilteral',
    'investment export oriented': 'Investment Export Oriented',
    'investment - export oriented': 'Investment Export Oriented',
    'export oriented trade': 'Investment Export Oriented',
    'export oriented investment': 'Investment Export Oriented',
    'export oriented trade': 'Investment Export Oriented',
    'import consumption': 'Import Consumption',
    'import (consumption)': 'Import Consumption',
    '(import reduction investment)': 'Import Reduction Investment',
    'import reduction investment': 'Import Reduction Investment',
    'import reduction investment': 'Import Reduction Investment',
    'investment - import reduction': 'Investment Import Reduction',
    'investment import reduction': 'Investment Import Reduction',
    'investment - others': 'Investment Others',
    'trade export': 'Trade Export',
    'trade - export': 'Trade Export',
    'trade import (service)': 'Trade Import (Service)',
    'trade import (services)': 'Trade Import (Service)',
    'trade - import (service)': 'Trade Import (Service)',
    'trade - import (services)': 'Trade Import (Service)',
  };

  if (map[key]) return map[key];

  const exact = DEFAULT_SIFC_CATEGORIES.find((c) => c.toLowerCase() === value.toLowerCase());
  return exact || value;
}

module.exports = {
  normalizeSectorName,
  normalizeSifcCategory,
};

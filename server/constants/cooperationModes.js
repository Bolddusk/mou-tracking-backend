const COOPERATION_MODES = ['mou', 'jv', 'agreement'];

const COOPERATION_MODE_LABELS = {
  mou: 'MoU',
  jv: 'JV',
  agreement: 'Agreement',
};

function normalizeCooperationMode(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (value === 'mou') return 'mou';
  if (value === 'jv') return 'jv';
  if (value === 'agreement' || value === 'contract') return 'agreement';
  return null;
}

module.exports = {
  COOPERATION_MODES,
  COOPERATION_MODE_LABELS,
  normalizeCooperationMode,
};

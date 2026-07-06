function normalizeEmail(value) {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase();
}

module.exports = { normalizeEmail };

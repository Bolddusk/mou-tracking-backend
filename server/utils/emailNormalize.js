const validator = require('validator');

function normalizeEmail(value) {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase();
}

/** Same bar as login (`express-validator` isEmail) — rejects e.g. user@domain.com123 */
function isValidLoginEmail(value) {
  if (value === null || value === undefined) return false;
  const email = String(value).trim();
  if (!email) return false;
  return validator.isEmail(email);
}

module.exports = { normalizeEmail, isValidLoginEmail };

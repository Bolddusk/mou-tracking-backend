const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generatePassword } = require('./generatePassword');

function isEmailConfigured() {
  const { isEmailEnabled } = require('./mailer');
  return isEmailEnabled();
}

function shouldReturnCredentialsInResponse() {
  const flag = process.env.RETURN_PARTY_B_CREDENTIALS_IN_RESPONSE;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  // Default: return in API when email is not configured (dev / until SMTP is set up)
  return !isEmailConfigured();
}

function buildCredentialsPayload(email, temporaryPassword) {
  return {
    email,
    temporary_password: temporaryPassword,
    login_url: process.env.CLIENT_LOGIN_URL || 'http://localhost:5173/auth/login',
    must_change_password: true,
  };
}

async function setTemporaryPassword(userId, rawPassword) {
  const hashedPassword = await bcrypt.hash(rawPassword, 10);
  await pool.query(
    'UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?',
    [hashedPassword, userId]
  );
}

async function issueTemporaryCredentials(user) {
  const rawPassword = generatePassword();
  await setTemporaryPassword(user.id, rawPassword);

  return {
    message: 'Temporary Party B credentials issued',
    credentials: buildCredentialsPayload(user.email, rawPassword),
  };
}

module.exports = {
  isEmailConfigured,
  shouldReturnCredentialsInResponse,
  buildCredentialsPayload,
  issueTemporaryCredentials,
  setTemporaryPassword,
};

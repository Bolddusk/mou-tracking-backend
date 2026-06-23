const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generatePassword } = require('./generatePassword');
const { sendPartyBInviteEmail } = require('./mailer');
const {
  shouldReturnCredentialsInResponse,
  buildCredentialsPayload,
  setTemporaryPassword,
} = require('./partyBCredentials');

async function findUserByEmail(email) {
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE email = ?', [
    email.trim().toLowerCase(),
  ]);
  return rows[0] || null;
}

async function provisionPartyBForProposal(proposal) {
  const result = {
    linked: false,
    user_id: null,
    account_created: false,
    existing_account: false,
    email_sent: false,
    skipped: false,
    reason: null,
    credentials: null,
  };

  const email = proposal.party_b_email?.trim().toLowerCase();
  if (!email) {
    result.skipped = true;
    result.reason = 'missing_party_b_email';
    return result;
  }

  if (!proposal.party_b_name?.trim()) {
    result.skipped = true;
    result.reason = 'missing_party_b_name';
    return result;
  }

  let userId;
  let rawPassword = null;

  const existing = await findUserByEmail(email);

  if (existing) {
    userId = existing.id;
    result.linked = true;
    result.user_id = userId;
    result.existing_account = true;
    rawPassword = generatePassword();
    await setTemporaryPassword(userId, rawPassword);
  } else {
    rawPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const [insert] = await pool.query(
      `INSERT INTO users (full_name, email, password, role, organization, phone, must_change_password)
       VALUES (?, ?, ?, 'party_b', ?, ?, 1)`,
      [
        proposal.party_b_name.trim(),
        email,
        hashedPassword,
        proposal.party_b_organization?.trim() || null,
        proposal.party_b_phone?.trim() || null,
      ]
    );

    userId = insert.insertId;
    result.linked = true;
    result.user_id = userId;
    result.account_created = true;
  }

  await pool.query('UPDATE proposals SET party_b_user_id = ? WHERE id = ?', [
    userId,
    proposal.id,
  ]);

  if (rawPassword) {
    if (shouldReturnCredentialsInResponse()) {
      result.credentials = buildCredentialsPayload(email, rawPassword);
    }

    try {
      await sendPartyBInviteEmail({
        partyBName: proposal.party_b_name.trim(),
        proposalTitle:
          proposal.venture_name ||
          proposal.company_name ||
          proposal.proposal_title ||
          'Investment Proposal',
        sector: proposal.sector || '—',
        email,
        password: rawPassword,
      });
      result.email_sent = true;
    } catch (err) {
      console.error('Party B invite email failed:', err.message);
      result.email_sent = false;
      result.email_error = err.message;
      if (!result.credentials) {
        result.credentials = buildCredentialsPayload(email, rawPassword);
      }
    }
  }

  return result;
}

module.exports = { provisionPartyBForProposal };

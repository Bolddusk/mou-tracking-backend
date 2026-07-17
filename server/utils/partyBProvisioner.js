const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generatePassword } = require('./generatePassword');
const { sendPartyBInviteEmail } = require('./mailer');
const {
  shouldReturnCredentialsInResponse,
  buildCredentialsPayload,
} = require('./partyBCredentials');
const { buildPartyBInfoFromRow } = require('./partyBInfo');
const { isValidLoginEmail } = require('./emailNormalize');

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

  const partyBInfo = buildPartyBInfoFromRow(proposal);
  const email = partyBInfo.email?.trim().toLowerCase();
  if (!email) {
    result.skipped = true;
    result.reason = 'missing_party_b_email';
    return result;
  }

  if (!isValidLoginEmail(email)) {
    result.skipped = true;
    result.reason = 'invalid_party_b_email';
    return result;
  }

  const contactName = partyBInfo.contact_name?.trim();
  if (!contactName) {
    result.skipped = true;
    result.reason = 'missing_party_b_name';
    return result;
  }

  let userId;
  let rawPassword = null;

  const existing = await findUserByEmail(email);

  if (existing) {
    // Existing account: only link to this MOU — do not reset password or re-send credentials
    userId = existing.id;
    result.linked = true;
    result.user_id = userId;
    result.existing_account = true;
    result.account_created = false;
    result.credentials = null;
    result.email_sent = false;
  } else {
    rawPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const [insert] = await pool.query(
      `INSERT INTO users (full_name, email, password, role, organization, phone, must_change_password)
       VALUES (?, ?, ?, 'party_b', ?, ?, 1)`,
      [
        contactName,
        email,
        hashedPassword,
        partyBInfo.organization_name?.trim() || null,
        partyBInfo.phone?.trim() || null,
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

  // Invite email + credentials only for newly created accounts
  if (result.account_created && rawPassword) {
    if (shouldReturnCredentialsInResponse()) {
      result.credentials = buildCredentialsPayload(email, rawPassword);
    }

    const { isEmailEnabled } = require('./mailer');
    if (!isEmailEnabled()) {
      result.email_sent = false;
      result.email_skipped = true;
      result.email_error = null;
      if (!result.credentials) {
        result.credentials = buildCredentialsPayload(email, rawPassword);
      }
      return result;
    }

    try {
      await sendPartyBInviteEmail({
        partyBName: contactName,
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

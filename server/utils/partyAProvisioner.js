const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generatePassword } = require('./generatePassword');
const { sendPartyAInviteEmail } = require('./mailer');
const {
  shouldReturnCredentialsInResponse,
  buildCredentialsPayload,
} = require('./partyBCredentials');
const { isValidLoginEmail } = require('./emailNormalize');

function parsePartyAInfo(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function findUserByEmail(email) {
  const [rows] = await pool.query(
    'SELECT id, email, role, ministry_id FROM users WHERE email = ?',
    [email.trim().toLowerCase()]
  );
  return rows[0] || null;
}

async function provisionPartyAForProposal(proposal) {
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

  const partyAInfo = parsePartyAInfo(proposal.party_a_info);
  const email = partyAInfo.email?.trim().toLowerCase();
  const contactName = partyAInfo.contact_name?.trim();

  if (!email) {
    result.skipped = true;
    result.reason = 'missing_party_a_email';
    return result;
  }

  if (!isValidLoginEmail(email)) {
    result.skipped = true;
    result.reason = 'invalid_party_a_email';
    return result;
  }

  if (!contactName) {
    result.skipped = true;
    result.reason = 'missing_party_a_contact_name';
    return result;
  }

  if (!proposal.ministry_id) {
    result.skipped = true;
    result.reason = 'missing_proposal_ministry';
    return result;
  }

  let userId;
  let rawPassword = null;

  const existing = await findUserByEmail(email);

  if (existing) {
    if (existing.role !== 'party_a') {
      result.skipped = true;
      result.reason = 'email_belongs_to_non_party_a_user';
      return result;
    }

    if (
      existing.ministry_id &&
      Number(existing.ministry_id) !== Number(proposal.ministry_id)
    ) {
      const err = new Error(
        'This email is already registered under a different ministry'
      );
      err.status = 400;
      err.code = 'ministry_email_conflict';
      throw err;
    }

    userId = existing.id;
    if (!existing.ministry_id) {
      await pool.query(`UPDATE users SET ministry_id = ? WHERE id = ?`, [
        proposal.ministry_id,
        userId,
      ]);
    }
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
      `INSERT INTO users (full_name, email, password, role, ministry_id, organization, phone, must_change_password)
       VALUES (?, ?, ?, 'party_a', ?, ?, ?, 1)`,
      [
        contactName,
        email,
        hashedPassword,
        proposal.ministry_id,
        partyAInfo.organization_name?.trim() || null,
        partyAInfo.phone?.trim() || null,
      ]
    );

    userId = insert.insertId;
    result.linked = true;
    result.user_id = userId;
    result.account_created = true;
  }

  await pool.query('UPDATE proposals SET party_a_id = ? WHERE id = ?', [userId, proposal.id]);
  await pool.query('INSERT IGNORE INTO party_a_profiles (user_id) VALUES (?)', [userId]);

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
      await sendPartyAInviteEmail({
        partyAName: contactName,
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
      console.error('Party A invite email failed:', err.message);
      result.email_sent = false;
      result.email_error = err.message;
      if (!result.credentials) {
        result.credentials = buildCredentialsPayload(email, rawPassword);
      }
    }
  }

  return result;
}

module.exports = { provisionPartyAForProposal };

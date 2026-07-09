const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generatePassword } = require('./generatePassword');
const { sendPartyAInviteEmail } = require('./mailer');
const {
  shouldReturnCredentialsInResponse,
  buildCredentialsPayload,
  setTemporaryPassword,
} = require('./partyBCredentials');

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
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE email = ?', [
    email.trim().toLowerCase(),
  ]);
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

  if (!contactName) {
    result.skipped = true;
    result.reason = 'missing_party_a_contact_name';
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
       VALUES (?, ?, ?, 'party_a', ?, ?, 1)`,
      [
        contactName,
        email,
        hashedPassword,
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

  if (rawPassword) {
    if (shouldReturnCredentialsInResponse()) {
      result.credentials = buildCredentialsPayload(email, rawPassword);
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

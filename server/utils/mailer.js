const nodemailer = require('nodemailer');

let transporter = null;

function getEmailPassword() {
  return process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || '';
}

function isEmailEnabled() {
  if (process.env.EMAIL_ENABLED === 'false') return false;
  const { EMAIL_HOST, EMAIL_USER } = process.env;
  return Boolean(EMAIL_HOST && EMAIL_USER && getEmailPassword());
}

function getFromAddress() {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const user = process.env.EMAIL_USER;
  const name = process.env.EMAIL_FROM_NAME;
  if (name && user) return `${name} <${user}>`;
  return user;
}

function getTransporter() {
  if (transporter) return transporter;

  if (!isEmailEnabled()) {
    return null;
  }

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER } = process.env;
  const secure =
    process.env.EMAIL_SECURE === 'true' ||
    process.env.EMAIL_ENCRYPTION === 'ssl' ||
    Number(EMAIL_PORT) === 465;

  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT) || 587,
    secure,
    auth: {
      user: EMAIL_USER,
      pass: getEmailPassword(),
    },
  });

  return transporter;
}

async function sendMail(to, subject, html) {
  const transport = getTransporter();
  if (!transport) {
    throw new Error(
      'Email is not configured or disabled (set EMAIL_ENABLED=true, EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env)'
    );
  }

  return transport.sendMail({
    from: getFromAddress(),
    to,
    subject,
    html,
  });
}

function buildPartyBInviteHtml({ partyBName, proposalTitle, sector, email, password }) {
  const loginUrl = process.env.CLIENT_LOGIN_URL || 'http://localhost:5173/auth/login';
  const portalName = process.env.PORTAL_NAME || 'Pakistan-China Investment Portal';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <div style="background: #1a1a2e; color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
        <p style="margin: 0; font-size: 12px; letter-spacing: 2px; color: #2dd4bf;">INVESTMENT</p>
        <h1 style="margin: 8px 0 0; font-size: 22px;">${portalName}</h1>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p>Dear <strong>${partyBName}</strong>,</p>
        <p>You have been added as <strong>Party B</strong> on the following proposal:</p>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0 0 4px;"><strong>${proposalTitle}</strong></p>
          <p style="margin: 0; color: #64748b;">Sector: ${sector}</p>
        </div>
        <p><strong>Your login credentials:</strong></p>
        <ul style="line-height: 1.8;">
          <li>Email: <code>${email}</code></li>
          <li>Password: <code>${password}</code></li>
        </ul>
        <p>
          <a href="${loginUrl}" style="display: inline-block; background: #14b8a6; color: #0f172a; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Login to Portal
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Please change your password after first login.</p>
      </div>
    </div>
  `;
}

async function sendPartyBInviteEmail({ partyBName, proposalTitle, sector, email, password }) {
  const subject = 'You have been invited to the Investment Portal';
  const html = buildPartyBInviteHtml({ partyBName, proposalTitle, sector, email, password });
  return sendMail(email, subject, html);
}

function buildPartyAInviteHtml({ partyAName, proposalTitle, sector, email, password }) {
  const loginUrl = process.env.CLIENT_LOGIN_URL || 'http://localhost:5173/auth/login';
  const portalName = process.env.PORTAL_NAME || 'Pakistan-China Investment Portal';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <div style="background: #1a1a2e; color: #fff; padding: 24px; border-radius: 8px 8px 0 0;">
        <p style="margin: 0; font-size: 12px; letter-spacing: 2px; color: #2dd4bf;">INVESTMENT</p>
        <h1 style="margin: 8px 0 0; font-size: 22px;">${portalName}</h1>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p>Dear <strong>${partyAName}</strong>,</p>
        <p>You have been added as <strong>Party A</strong> on the following proposal:</p>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0 0 4px;"><strong>${proposalTitle}</strong></p>
          <p style="margin: 0; color: #64748b;">Sector: ${sector}</p>
        </div>
        <p><strong>Your login credentials:</strong></p>
        <ul style="line-height: 1.8;">
          <li>Email: <code>${email}</code></li>
          <li>Password: <code>${password}</code></li>
        </ul>
        <p>
          <a href="${loginUrl}" style="display: inline-block; background: #14b8a6; color: #0f172a; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Login to Portal
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Please change your password after first login.</p>
      </div>
    </div>
  `;
}

async function sendPartyAInviteEmail({ partyAName, proposalTitle, sector, email, password }) {
  const subject = 'You have been invited to the Investment Portal';
  const html = buildPartyAInviteHtml({ partyAName, proposalTitle, sector, email, password });
  return sendMail(email, subject, html);
}

module.exports = {
  isEmailEnabled,
  getFromAddress,
  sendMail,
  sendPartyBInviteEmail,
  buildPartyBInviteHtml,
  sendPartyAInviteEmail,
  buildPartyAInviteHtml,
};

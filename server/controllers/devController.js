const { sendMail, sendPartyBInviteEmail, isEmailEnabled, getFromAddress } = require('../utils/mailer');

async function getEmailStatus(req, res) {
  try {
    return res.json({
      email_enabled: isEmailEnabled(),
      from: getFromAddress(),
      host: process.env.EMAIL_HOST || null,
      port: process.env.EMAIL_PORT || null,
      secure: process.env.EMAIL_SECURE === 'true' || process.env.EMAIL_ENCRYPTION === 'ssl',
      user: process.env.EMAIL_USER || null,
    });
  } catch (err) {
    console.error('Email status error:', err.message);
    return res.status(500).json({ error: 'Failed to read email config' });
  }
}

async function testEmail(req, res) {
  try {
    if (!isEmailEnabled()) {
      return res.status(400).json({
        error: 'Email is not configured or disabled',
        hint: 'Set EMAIL_ENABLED=true, EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env',
      });
    }

    const {
      to,
      subject,
      message,
      template,
      party_b_name,
      proposal_title,
      sector,
      email,
      password,
    } = req.body;

    const recipient = to || email || process.env.EMAIL_USER;
    if (!recipient) {
      return res.status(400).json({ error: 'to (or email) is required' });
    }

    let info;

    if (template === 'party_b_invite') {
      if (!party_b_name || !proposal_title || !sector || !password) {
        return res.status(400).json({
          error: 'party_b_invite template requires: party_b_name, proposal_title, sector, password',
        });
      }

      info = await sendPartyBInviteEmail({
        partyBName: party_b_name,
        proposalTitle: proposal_title,
        sector,
        email: recipient,
        password,
      });
    } else {
      info = await sendMail(
        recipient,
        subject || 'AVRIO — Investment Portal email test',
        message
          ? `<p>${message}</p><p><small>Sent at ${new Date().toISOString()}</small></p>`
          : `<p>SMTP test successful from Investment Portal.</p><p><small>Sent at ${new Date().toISOString()}</small></p>`
      );
    }

    return res.json({
      message: 'Email sent successfully',
      to: recipient,
      from: getFromAddress(),
      message_id: info.messageId,
      response: info.response,
    });
  } catch (err) {
    console.error('Test email error:', err.message);
    return res.status(500).json({
      error: 'Failed to send email',
      detail: err.message,
      code: err.code || null,
      smtp_response: err.response || null,
    });
  }
}

module.exports = { getEmailStatus, testEmail };

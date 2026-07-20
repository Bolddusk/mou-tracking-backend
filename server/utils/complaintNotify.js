const { sendMail, isEmailEnabled } = require('./mailer');

function portalComplaintsUrl(complaintId) {
  const base = process.env.CLIENT_URL || process.env.CLIENT_LOGIN_URL || 'http://localhost:5173';
  const root = String(base).replace(/\/auth\/login\/?$/, '').replace(/\/$/, '');
  return `${root}/complaints/${complaintId}`;
}

function buildComplaintEmailHtml({ heading, bodyLines = [], complaintId, title }) {
  const url = portalComplaintsUrl(complaintId);
  const lines = bodyLines.map((line) => `<p style="margin:0 0 8px;">${line}</p>`).join('');
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
      <div style="background: #1b4d3e; color: #fff; padding: 20px; border-radius: 8px 8px 0 0;">
        <p style="margin: 0; font-size: 12px; letter-spacing: 1px;">MOU TRACKING</p>
        <h1 style="margin: 8px 0 0; font-size: 18px;">${heading}</h1>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 12px;"><strong>Complaint #${complaintId}</strong>${title ? ` — ${title}` : ''}</p>
        ${lines}
        <p style="margin: 16px 0 0;">
          <a href="${url}" style="display:inline-block;background:#1b4d3e;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:600;">
            Open complaint
          </a>
        </p>
      </div>
    </div>
  `;
}

async function notifyEmails(recipients, subject, html) {
  if (!isEmailEnabled()) {
    return { sent: false, skipped: true, reason: 'email_disabled' };
  }
  const list = [...new Set((recipients || []).filter(Boolean))];
  const results = [];
  for (const to of list) {
    try {
      await sendMail(to, subject, html);
      results.push({ to, ok: true });
    } catch (err) {
      console.error('Complaint email failed:', to, err.message);
      results.push({ to, ok: false, error: err.message });
    }
  }
  return { sent: results.some((r) => r.ok), skipped: false, results };
}

async function notifyComplaintFiled({ complaint, sectorLeadEmail, superAdminEmails = [] }) {
  const html = buildComplaintEmailHtml({
    heading: 'New complaint filed',
    complaintId: complaint.id,
    title: complaint.title,
    bodyLines: [
      `A new complaint was filed on MOU #${complaint.proposal_id}.`,
      `Status: <strong>${complaint.status}</strong>`,
      complaint.awaiting_sector_lead
        ? 'No sector lead was assigned for this sector — Super Admin should assign/review.'
        : 'Please review and respond.',
    ],
  });
  const to = [sectorLeadEmail, ...superAdminEmails];
  return notifyEmails(to, `[MOU] New complaint #${complaint.id}: ${complaint.title}`, html);
}

async function notifyComplaintStatusChange({
  complaint,
  filerEmail,
  sectorLeadEmail,
  outcomeLabel,
  comment,
}) {
  const html = buildComplaintEmailHtml({
    heading: `Complaint ${outcomeLabel}`,
    complaintId: complaint.id,
    title: complaint.title,
    bodyLines: [
      `Status is now <strong>${complaint.status}</strong>.`,
      comment ? `Official comment: ${comment}` : null,
    ].filter(Boolean),
  });
  return notifyEmails(
    [filerEmail, sectorLeadEmail],
    `[MOU] Complaint #${complaint.id} ${outcomeLabel}`,
    html
  );
}

async function notifyComplaintComment({ complaint, recipientEmails, authorName, comment }) {
  const html = buildComplaintEmailHtml({
    heading: 'New comment on complaint',
    complaintId: complaint.id,
    title: complaint.title,
    bodyLines: [
      `<strong>${authorName || 'User'}</strong> commented:`,
      `<em>${comment}</em>`,
    ],
  });
  return notifyEmails(
    recipientEmails,
    `[MOU] Comment on complaint #${complaint.id}`,
    html
  );
}

async function notifyComplaintEscalated({ complaint, superAdminEmails, filerEmail, sectorLeadEmail }) {
  const html = buildComplaintEmailHtml({
    heading: 'Complaint escalated to Super Admin',
    complaintId: complaint.id,
    title: complaint.title,
    bodyLines: ['This complaint was escalated for Super Admin attention.'],
  });
  return notifyEmails(
    [...superAdminEmails, filerEmail, sectorLeadEmail],
    `[MOU] Escalated complaint #${complaint.id}`,
    html
  );
}

module.exports = {
  notifyComplaintFiled,
  notifyComplaintStatusChange,
  notifyComplaintComment,
  notifyComplaintEscalated,
  portalComplaintsUrl,
};

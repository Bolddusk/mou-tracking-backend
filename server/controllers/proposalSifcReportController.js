const { getConferenceByKey } = require('../constants/conferences');
const {
  buildProposalSifcReport,
  fetchProposalForSifcReport,
} = require('../utils/conferenceReport');
const {
  singleMouSifcReportToPdf,
  singleMouSifcReportToXlsx,
} = require('../utils/singleMouSifcReportFormats');
const { checkProposalAccess } = require('../utils/proposalAccess');

const REPORT_ROLES = new Set(['super_admin', 'admin', 'power_admin', 'sector_lead']);

function reportDownloadBasename(proposalId) {
  return `SIFC-report-mou-${proposalId}`;
}

async function getProposalSifcReport(req, res) {
  try {
    if (!REPORT_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const proposalId = Number(req.params.id);
    if (!proposalId) {
      return res.status(400).json({ error: 'Invalid proposal id' });
    }

    const proposal = await fetchProposalForSifcReport(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (proposal.status === 'draft') {
      return res.status(400).json({ error: 'Draft proposals cannot be exported as SIFC report' });
    }

    const conference = proposal.conference_key
      ? getConferenceByKey(proposal.conference_key)
      : null;

    const report = await buildProposalSifcReport(proposal, conference);
    const format = String(req.query.format || 'json').toLowerCase();
    const basename = reportDownloadBasename(proposalId);

    if (format === 'json') {
      return res.json(report);
    }

    if (format === 'xlsx' || format === 'xls') {
      const body = await singleMouSifcReportToXlsx(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${basename}.xlsx"`);
      return res.send(Buffer.from(body));
    }

    if (format === 'pdf') {
      let body;
      try {
        body = await singleMouSifcReportToPdf(report);
      } catch (pdfErr) {
        const msg = String(pdfErr.message || '');
        if (/chrome not found|failed to launch the browser/i.test(msg)) {
          console.error('Proposal SIFC PDF error:', pdfErr.message);
          return res.status(503).json({
            error: 'PDF export unavailable — Chromium not installed on server',
            hint: 'Rebuild Docker image (includes Chromium) or set PUPPETEER_EXECUTABLE_PATH',
            fallback: 'Use format=xlsx or JSON preview with browser Print',
          });
        }
        throw pdfErr;
      }

      const disposition = req.query.download === '1' ? 'attachment' : 'inline';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${disposition}; filename="${basename}.pdf"`);
      return res.send(body);
    }

    return res.status(400).json({ error: 'Invalid format. Use json, xlsx, or pdf' });
  } catch (err) {
    console.error('Proposal SIFC report error:', err.message);
    if (err.stack) console.error(err.stack);
    return res.status(500).json({ error: 'Failed to generate SIFC report' });
  }
}

module.exports = { getProposalSifcReport };

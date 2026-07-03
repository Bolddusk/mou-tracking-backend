const { getConferenceByKey, getReportableConference } = require('../constants/conferences');
const { buildConferenceReport } = require('../utils/conferenceReport');
const {
  conferenceReportToPdf,
  conferenceReportToXlsx,
  reportDownloadBasename,
} = require('../utils/conferenceReportFormats');
const { getSectorLeadScopedSectors } = require('../utils/sectorLeadAssignments');

const REPORT_ROLES = new Set(['super_admin', 'admin', 'sector_lead']);

async function getConferenceReport(req, res) {
  try {
    if (!REPORT_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const conferenceKey = String(req.query.conference_key || '').trim();
    if (!conferenceKey) {
      return res.status(400).json({ error: 'conference_key is required' });
    }

    const known = getConferenceByKey(conferenceKey);
    if (!known) {
      return res.status(404).json({ error: 'Conference not found', conference_key: conferenceKey });
    }

    const conference = getReportableConference(conferenceKey);
    if (!conference) {
      return res.status(403).json({
        error: 'Conference does not support reports',
        conference_key: conferenceKey,
      });
    }

    let sectorScopes = null;
    let scope = { list_scope: 'all', sector: null, sectors: null };

    if (req.user.role === 'sector_lead') {
      sectorScopes = getSectorLeadScopedSectors(req.user);
      if (!sectorScopes.length) {
        return res.status(400).json({ error: 'Sector lead profile has no sector assigned' });
      }
      scope = {
        list_scope: 'sector',
        sector: sectorScopes.length === 1 ? sectorScopes[0] : null,
        sectors: sectorScopes,
      };
    }

    const report = await buildConferenceReport(conference, { sectorScopes, scope });
    const format = String(req.query.format || 'json').toLowerCase();
    const basename = reportDownloadBasename(conferenceKey);

    if (format === 'json') {
      return res.json(report);
    }

    if (format === 'xlsx') {
      const body = await conferenceReportToXlsx(report);
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
        body = await conferenceReportToPdf(report);
      } catch (pdfErr) {
        const msg = String(pdfErr.message || '');
        if (/chrome not found|failed to launch the browser/i.test(msg)) {
          console.error('Conference PDF error:', pdfErr.message);
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
    console.error('Conference report error:', err.message);
    if (err.stack) console.error(err.stack);
    return res.status(500).json({ error: 'Failed to generate conference report' });
  }
}

module.exports = { getConferenceReport };

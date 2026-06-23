const { checkProposalAccess } = require('../utils/proposalAccess');
const { buildProposalReport, getProposalForReport } = require('../utils/proposalReport');
const { reportToCsv, reportToXlsx, reportToPdf } = require('../utils/proposalReportFormats');

const EXPORT_ROLES = new Set(['sector_lead', 'super_admin']);

const FORMAT_HANDLERS = {
  csv: {
    mime: 'text/csv; charset=utf-8',
    ext: 'csv',
    inline: false,
    build: (report) => Promise.resolve(`\uFEFF${reportToCsv(report)}`),
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
    inline: false,
    build: reportToXlsx,
  },
  xls: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
    inline: false,
    build: reportToXlsx,
  },
  pdf: {
    mime: 'application/pdf',
    ext: 'pdf',
    inline: true,
    build: reportToPdf,
  },
};

async function exportProposalReport(req, res) {
  try {
    if (!EXPORT_ROLES.has(req.user.role)) {
      return res.status(403).json({ error: 'Only sector lead and super admin can export reports' });
    }

    const proposalId = Number(req.params.id);
    if (!proposalId) {
      return res.status(400).json({ error: 'Invalid proposal id' });
    }

    const proposal = await getProposalForReport(proposalId);
    const access = await checkProposalAccess(req, proposal);
    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (proposal.status === 'draft') {
      return res.status(400).json({ error: 'Draft proposals cannot be exported' });
    }

    const report = await buildProposalReport(proposalId, req.user);
    if (!report) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'json') {
      return res.json(report);
    }

    const handler = FORMAT_HANDLERS[format];
    if (!handler) {
      return res.status(400).json({
        error: 'Invalid format. Use json, pdf, xlsx, xls, or csv',
      });
    }

    const body = await handler.build(report);
    const filename = `proposal-${proposalId}-report.${handler.ext}`;
    const disposition = handler.inline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', handler.mime);
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    return res.send(body);
  } catch (err) {
    console.error('Export proposal report error:', err.message);
    return res.status(500).json({ error: 'Failed to export proposal report' });
  }
}

module.exports = { exportProposalReport };

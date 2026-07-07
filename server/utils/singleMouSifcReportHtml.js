const { escapeHtml } = require('./conferenceReportHtml');

function multilineHtml(value) {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function buildMouDetailsTable(report) {
  const rows = report.mou_details
    .map(
      (row) => `<tr>
        <th>${escapeHtml(row.field)}</th>
        <td>${multilineHtml(row.value)}</td>
      </tr>`
    )
    .join('');

  return `<table class="report-table details-kv"><tbody>${rows}</tbody></table>`;
}

function buildProgressTable(report) {
  const columns = report.progress_columns;
  const head = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('');

  const body = report.progress_rows.length
    ? report.progress_rows
        .map((row) => {
          const cells = columns
            .map((col) => {
              const wrap = col.wrap ? ' class="wrap"' : '';
              return `<td${wrap}>${multilineHtml(row[col.key] ?? '—')}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('')
    : `<tr><td colspan="${columns.length}" class="empty">No progress updates recorded.</td></tr>`;

  return `<table class="report-table detail">
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function buildSingleMouSifcReportHtml(report) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(report.conference.report_title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; padding: 0; }
    h1 { font-size: 14pt; text-align: center; margin: 0 0 6px; font-weight: bold; }
    h2 { font-size: 11pt; text-align: center; margin: 0 0 14px; font-weight: normal; color: #333; }
    .meta { text-align: right; font-size: 8pt; color: #666; margin-bottom: 10px; }
    .section-bar {
      background: #FFF200;
      font-weight: bold;
      padding: 6px 8px;
      border: 1px solid #000;
      margin-top: 16px;
      margin-bottom: 0;
    }
    .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .report-table th, .report-table td {
      border: 1px solid #000;
      padding: 4px 6px;
      vertical-align: top;
      word-wrap: break-word;
    }
    .details-kv th {
      width: 28%;
      background: #C5E0B4;
      text-align: left;
      font-weight: bold;
    }
    .report-table.detail thead th {
      background: #548235;
      color: #fff;
      font-weight: bold;
      text-align: center;
    }
    .wrap { white-space: pre-wrap; }
    .empty { text-align: center; font-style: italic; color: #666; }
    .page-break { page-break-before: always; }
    @page { size: A4 landscape; margin: 10mm; }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.conference.report_title)}</h1>
  <h2>${escapeHtml(report.conference.name)}</h2>
  <div class="meta">Generated: ${escapeHtml(report.generated_at)} · Proposal #${escapeHtml(report.proposal.id)}</div>

  <div class="section-bar">MOU Details</div>
  ${buildMouDetailsTable(report)}

  <section class="page-break">
    <div class="section-bar">Progress Updates (${report.progress_count})</div>
    ${buildProgressTable(report)}
  </section>
</body>
</html>`;
}

module.exports = { buildSingleMouSifcReportHtml };

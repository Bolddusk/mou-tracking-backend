function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

function multilineHtml(value) {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function snapshotRowCells(row) {
  if (row.row_type === 'data') {
    return {
      category: row.category,
      agreements: `${row.sub_category} (${String(row.agreement_type || 'mou').toUpperCase()})`,
      no: row.total_count,
      total: row.total_value_usd_m,
      execNo: row.in_execution.count,
      execAmt: row.in_execution.amount_usd_m,
      activeNo: row.active.count,
      activeAmt: row.active.amount_usd_m,
      inactiveNo: row.inactive.count,
      inactiveAmt: row.inactive.amount_usd_m,
      isGrand: false,
      isSubtotal: false,
    };
  }

  return {
    category: row.category || row.label || '',
    agreements: row.row_type === 'subtotal' ? 'Subtotal' : row.label || 'Grand Total',
    no: row.total_count,
    total: row.total_value_usd_m,
    execNo: row.in_execution?.count ?? 0,
    execAmt: row.in_execution?.amount_usd_m ?? 0,
    activeNo: row.active?.count ?? 0,
    activeAmt: row.active?.amount_usd_m ?? 0,
    inactiveNo: row.inactive?.count ?? 0,
    inactiveAmt: row.inactive?.amount_usd_m ?? 0,
    isGrand: row.row_type === 'grand_total',
    isSubtotal: row.row_type === 'subtotal',
  };
}

function buildSnapshotTable(report) {
  const header = `
    <thead>
      <tr class="hdr-yellow">
        <th rowspan="2">Category</th>
        <th rowspan="2">Agreements</th>
        <th rowspan="2">No.</th>
        <th rowspan="2">Total Value<br/>(USD Million)</th>
        <th colspan="2">In Execution</th>
        <th colspan="2">Active</th>
        <th colspan="2">Inactive</th>
      </tr>
      <tr class="hdr-green">
        <th>No.</th><th>Amount</th>
        <th>No.</th><th>Amount</th>
        <th>No.</th><th>Amount</th>
      </tr>
    </thead>`;

  const body = report.snapshot.rows
    .map((row) => {
      const c = snapshotRowCells(row);
      const cls = c.isGrand ? 'grand-total' : c.isSubtotal ? 'subtotal' : '';
      return `<tr class="${cls}">
        <td>${escapeHtml(c.category)}</td>
        <td>${escapeHtml(c.agreements)}</td>
        <td class="num">${c.no}</td>
        <td class="num">${formatAmount(c.total)}</td>
        <td class="num">${c.execNo}</td>
        <td class="num">${formatAmount(c.execAmt)}</td>
        <td class="num">${c.activeNo}</td>
        <td class="num">${formatAmount(c.activeAmt)}</td>
        <td class="num">${c.inactiveNo}</td>
        <td class="num">${formatAmount(c.inactiveAmt)}</td>
      </tr>`;
    })
    .join('');

  return `<table class="report-table snapshot">${header}<tbody>${body}</tbody></table>`;
}

function buildDetailSection(title, columns, rows) {
  const head = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  const body = rows.length
    ? rows
        .map((row) => {
          const cells = columns
            .map((col) => {
              const key = col.key;
              let val = row[key];
              if (key === 'mou_value_usd_m') {
                val = row.value_label || (val != null ? formatAmount(val) : '—');
              }
              const wrap = col.wrap ? ' class="wrap"' : '';
              const content = col.wrap ? multilineHtml(val) : escapeHtml(val ?? '—');
              return `<td${wrap}>${content}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('')
    : `<tr><td colspan="${columns.length}" class="empty">No records.</td></tr>`;

  return `
    <section class="detail-section page-break">
      <div class="section-bar">${escapeHtml(title)}</div>
      <table class="report-table detail">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

function buildConferenceReportHtml(report) {
  const executionCols = [
    { key: 'sr', label: 'Sr' },
    { key: 'pak_company', label: 'Pak. company' },
    { key: 'chinese_company', label: 'Chinese company' },
    { key: 'mou_value_usd_m', label: 'MoU Value (USD M) / location' },
    { key: 'outcome', label: 'Outcome' },
    { key: 'status_feedback', label: 'Status/Feedback', wrap: true },
    { key: 'action_taken', label: 'Action Taken' },
    { key: 'tentative_timeline', label: 'Tentative Timelines' },
  ];

  const activeCols = [
    { key: 'sr', label: 'Sr' },
    { key: 'pak_company', label: 'Pak. company' },
    { key: 'chinese_company', label: 'Chinese company' },
    { key: 'mou_value_usd_m', label: 'MoU Value (USD M) / location' },
    { key: 'product', label: 'Product' },
    { key: 'status_feedback', label: 'Status/Feedback', wrap: true },
    { key: 'bottlenecks', label: 'Bottlenecks' },
    { key: 'tentative_timeline', label: 'Tentative Timelines' },
  ];

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
    .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .report-table th, .report-table td {
      border: 1px solid #000;
      padding: 4px 6px;
      vertical-align: top;
      word-wrap: break-word;
    }
    .hdr-yellow th { background: #FFF200; font-weight: bold; text-align: center; }
    .hdr-green th { background: #C5E0B4; font-weight: bold; text-align: center; }
    .report-table.detail thead th {
      background: #548235;
      color: #fff;
      font-weight: bold;
      text-align: center;
    }
    .num { text-align: right; }
    .subtotal td { font-weight: bold; }
    .grand-total td { background: #FFF200; font-weight: bold; }
    .section-bar {
      background: #FFF200;
      font-weight: bold;
      padding: 6px 8px;
      border: 1px solid #000;
      margin-top: 16px;
      margin-bottom: 0;
    }
    .detail-section .report-table { margin-top: 0; }
    .wrap { white-space: pre-wrap; }
    .empty { text-align: center; font-style: italic; color: #666; }
    .page-break { page-break-before: always; }
    .snapshot-page { page-break-after: always; }
    @page { size: A4 landscape; margin: 10mm; }
  </style>
</head>
<body>
  <div class="snapshot-page">
    <h1>${escapeHtml(report.conference.report_title)}</h1>
    <h2>${escapeHtml(report.conference.name)}</h2>
    <div class="meta">Generated: ${escapeHtml(report.generated_at)}</div>
    ${buildSnapshotTable(report)}
  </div>
  ${buildDetailSection('MoUs in Execution', executionCols, report.sections.in_execution)}
  ${buildDetailSection('MoUs (Active)', activeCols, report.sections.active)}
  ${buildDetailSection('MoUs (Inactive)', activeCols, report.sections.inactive)}
</body>
</html>`;
}

module.exports = {
  buildConferenceReportHtml,
  escapeHtml,
  formatAmount,
};

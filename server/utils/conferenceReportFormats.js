const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { buildConferenceReportHtml } = require('./conferenceReportHtml');

const COLORS = {
  headerYellow: 'FFFFF200',
  subHeaderGreen: 'FFC5E0B4',
  detailHeader: 'FF548235',
  white: 'FFFFFFFF',
};

function thinBorder() {
  const side = { style: 'thin', color: { argb: 'FF000000' } };
  return { top: side, left: side, bottom: side, right: side };
}

function styleCell(cell, options = {}) {
  cell.border = thinBorder();
  if (options.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } };
  }
  if (options.font) cell.font = options.font;
  if (options.alignment) cell.alignment = options.alignment;
  if (options.numFmt) cell.numFmt = options.numFmt;
}

function agreementLabel(row) {
  if (row.row_type !== 'data') return row.row_type === 'subtotal' ? 'Subtotal' : row.label || 'Grand Total';
  return `${row.sub_category} (${String(row.agreement_type || 'mou').toUpperCase()})`;
}

function snapshotRowValues(row) {
  return {
    category: row.row_type === 'data' ? row.category : row.category || row.label || '',
    agreements: agreementLabel(row),
    no: row.total_count ?? 0,
    total: row.total_value_usd_m ?? 0,
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

function buildSnapshotSheet(workbook, report) {
  const sheet = workbook.addWorksheet('Snapshot', {
    views: [{ state: 'frozen', ySplit: 4, xSplit: 0 }],
  });

  sheet.columns = [
    { width: 22 },
    { width: 34 },
    { width: 8 },
    { width: 16 },
    { width: 10 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
  ];

  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = report.conference.report_title;
  styleCell(titleCell, {
    font: { bold: true, size: 14 },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  sheet.mergeCells('A2:J2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = report.conference.name;
  styleCell(subtitleCell, {
    font: { size: 11 },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  const headerFont = { bold: true, size: 10 };
  const merges = [
    ['A3', 'A4', 'Category'],
    ['B3', 'B4', 'Agreements'],
    ['C3', 'C4', 'No.'],
    ['D3', 'D4', 'Total Value (USD Million)'],
    ['E3', 'F3', 'In Execution'],
    ['G3', 'H3', 'Active'],
    ['I3', 'J3', 'Inactive'],
  ];

  for (const [from, to, label] of merges) {
    if (from !== to) sheet.mergeCells(`${from}:${to}`);
    const cell = sheet.getCell(from);
    cell.value = label;
    styleCell(cell, {
      fill: COLORS.headerYellow,
      font: headerFont,
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    });
  }

  const subHeaders = [
    ['E4', 'No.'],
    ['F4', 'Amount'],
    ['G4', 'No.'],
    ['H4', 'Amount'],
    ['I4', 'No.'],
    ['J4', 'Amount'],
  ];
  for (const [addr, label] of subHeaders) {
    const cell = sheet.getCell(addr);
    cell.value = label;
    styleCell(cell, {
      fill: COLORS.subHeaderGreen,
      font: headerFont,
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
  }

  let rowNum = 5;
  for (const row of report.snapshot.rows) {
    const v = snapshotRowValues(row);
    const excelRow = sheet.getRow(rowNum);
    excelRow.values = [
      v.category,
      v.agreements,
      v.no,
      v.total,
      v.execNo,
      v.execAmt,
      v.activeNo,
      v.activeAmt,
      v.inactiveNo,
      v.inactiveAmt,
    ];

    for (let col = 1; col <= 10; col += 1) {
      const cell = excelRow.getCell(col);
      const isAmountCol = [4, 6, 8, 10].includes(col);
      styleCell(cell, {
        fill: v.isGrand ? COLORS.headerYellow : undefined,
        font: { bold: v.isGrand || v.isSubtotal },
        alignment: {
          horizontal: col >= 3 ? 'right' : 'left',
          vertical: 'top',
          wrapText: col <= 2,
        },
        numFmt: isAmountCol ? '#,##0.00' : undefined,
      });
    }
    rowNum += 1;
  }

  sheet.getRow(3).height = 22;
  sheet.getRow(4).height = 18;
}

function addDetailSheet(workbook, sheetName, sectionTitle, columns, rows) {
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 0 }],
  });

  sheet.columns = columns.map((col) => ({ width: col.width }));

  sheet.mergeCells(1, 1, 1, columns.length);
  const bar = sheet.getCell(1, 1);
  bar.value = sectionTitle;
  styleCell(bar, {
    fill: COLORS.headerYellow,
    font: { bold: true, size: 11 },
    alignment: { horizontal: 'left', vertical: 'middle' },
  });

  const headerRow = sheet.getRow(2);
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.header;
    styleCell(cell, {
      fill: COLORS.detailHeader,
      font: { bold: true, color: { argb: COLORS.white }, size: 10 },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    });
  });

  let rowNum = 3;
  if (!rows.length) {
    const row = sheet.getRow(rowNum);
    sheet.mergeCells(rowNum, 1, rowNum, columns.length);
    const cell = row.getCell(1);
    cell.value = 'No records.';
    styleCell(cell, { alignment: { horizontal: 'center', vertical: 'middle' } });
    return;
  }

  for (const item of rows) {
    const row = sheet.getRow(rowNum);
    columns.forEach((col, index) => {
      const cell = row.getCell(index + 1);
      let value = item[col.key];
      if (col.key === 'mou_value_usd_m') {
        value = item.value_label || (value != null ? Number(value) : '—');
      }
      cell.value = value ?? '—';
      styleCell(cell, {
        alignment: {
          horizontal: col.key === 'sr' ? 'center' : 'left',
          vertical: 'top',
          wrapText: Boolean(col.wrap),
        },
        numFmt:
          col.key === 'mou_value_usd_m' && typeof value === 'number' ? '#,##0.00' : undefined,
      });
    });
    rowNum += 1;
  }
}

async function conferenceReportToXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pakistan-China Investment Portal';
  workbook.created = new Date();

  buildSnapshotSheet(workbook, report);

  const executionCols = [
    { header: 'Sr', key: 'sr', width: 6 },
    { header: 'Pak. company', key: 'pak_company', width: 28 },
    { header: 'Chinese company', key: 'chinese_company', width: 28 },
    { header: 'Sector', key: 'sector', width: 22 },
    { header: 'MoU Value (USD M) / location', key: 'mou_value_usd_m', width: 20 },
    { header: 'Outcome', key: 'outcome', width: 30 },
    { header: 'Status/Feedback', key: 'status_feedback', width: 40, wrap: true },
    { header: 'Bottleneck', key: 'bottlenecks', width: 22 },
    { header: 'Tentative Timelines', key: 'tentative_timeline', width: 18 },
  ];

  const activeCols = [
    { header: 'Sr', key: 'sr', width: 6 },
    { header: 'Pak. company', key: 'pak_company', width: 28 },
    { header: 'Chinese company', key: 'chinese_company', width: 28 },
    { header: 'Sector', key: 'sector', width: 22 },
    { header: 'MoU Value (USD M) / location', key: 'mou_value_usd_m', width: 20 },
    { header: 'Product', key: 'product', width: 30 },
    { header: 'Status/Feedback', key: 'status_feedback', width: 40, wrap: true },
    { header: 'Bottleneck', key: 'bottlenecks', width: 18 },
    { header: 'Tentative Timelines', key: 'tentative_timeline', width: 18 },
  ];

  addDetailSheet(
    workbook,
    'MoUs in Execution',
    'MoUs in Execution',
    executionCols,
    report.sections.in_execution
  );
  addDetailSheet(workbook, 'MoUs (Active)', 'MoUs (Active)', activeCols, report.sections.active);
  addDetailSheet(workbook, 'MoUs (Inactive)', 'MoUs (Inactive)', activeCols, report.sections.inactive);

  return workbook.xlsx.writeBuffer();
}

function chromeCandidatePaths() {
  const fromEnv = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH].filter(Boolean);
  if (process.platform === 'win32') {
    return [
      ...fromEnv,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
  }
  if (process.platform === 'darwin') {
    return [...fromEnv, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }
  return [
    ...fromEnv,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];
}

function isExecutableFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return fs.statSync(filePath).isFile();
  }
}

async function resolveChromeExecutable() {
  for (const candidate of chromeCandidatePaths()) {
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  try {
    const bundled = await puppeteer.executablePath();
    if (isExecutableFile(bundled)) {
      return bundled;
    }
  } catch {
    // fall through
  }

  return null;
}

async function launchPdfBrowser() {
  const executablePath = await resolveChromeExecutable();
  if (!executablePath) {
    const hint =
      process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH
        ? 'Configured Chrome path is missing or not executable'
        : 'Install Chromium (Docker: rebuild image) or run: npm run puppeteer:install-chrome';
    throw new Error(`Chrome not found for PDF export. ${hint}`);
  }

  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
      '--disable-software-rasterizer',
    ],
  });
}

async function conferenceReportToPdf(report) {
  const html = buildConferenceReportHtml(report);
  let browser;

  try {
    browser = await launchPdfBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.emulateMediaType('screen');

    return await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      timeout: 120000,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function checkPdfExportAvailable() {
  const executablePath = await resolveChromeExecutable();
  return {
    available: Boolean(executablePath),
    executable_path: executablePath || null,
    hint: executablePath
      ? null
      : 'Run: npm run puppeteer:install-chrome — or deploy via Docker (includes Chromium)',
  };
}

function reportDownloadBasename(conferenceKey) {
  return `SIFC-report-${conferenceKey}`;
}

module.exports = {
  conferenceReportToXlsx,
  conferenceReportToPdf,
  reportDownloadBasename,
  launchPdfBrowser,
  checkPdfExportAvailable,
};

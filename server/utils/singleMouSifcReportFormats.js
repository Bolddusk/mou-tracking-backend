const ExcelJS = require('exceljs');
const { buildSingleMouSifcReportHtml } = require('./singleMouSifcReportHtml');
const { launchPdfBrowser } = require('./conferenceReportFormats');

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
}

function buildMouDetailsSheet(workbook, report) {
  const sheet = workbook.addWorksheet('MOU Details', {
    views: [{ state: 'frozen', ySplit: 3, xSplit: 0 }],
  });

  sheet.columns = [{ width: 28 }, { width: 72 }];

  sheet.mergeCells('A1:B1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = report.conference.report_title;
  styleCell(titleCell, {
    font: { bold: true, size: 14 },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  sheet.mergeCells('A2:B2');
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = report.conference.name;
  styleCell(subtitleCell, {
    font: { size: 11 },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  let rowNum = 4;
  for (const row of report.mou_details) {
    const excelRow = sheet.getRow(rowNum);
    const fieldCell = excelRow.getCell(1);
    const valueCell = excelRow.getCell(2);

    fieldCell.value = row.field;
    valueCell.value = row.value ?? '—';

    styleCell(fieldCell, {
      fill: COLORS.subHeaderGreen,
      font: { bold: true },
      alignment: { vertical: 'top', wrapText: true },
    });
    styleCell(valueCell, {
      alignment: { vertical: 'top', wrapText: true },
    });

    rowNum += 1;
  }
}

function buildProgressSheet(workbook, report) {
  const sheet = workbook.addWorksheet('Progress', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 0 }],
  });

  const columns = report.progress_columns;
  sheet.columns = columns.map((col) => ({ width: col.width }));

  sheet.mergeCells(1, 1, 1, columns.length);
  const bar = sheet.getCell(1, 1);
  bar.value = `Progress Updates (${report.progress_count})`;
  styleCell(bar, {
    fill: COLORS.headerYellow,
    font: { bold: true, size: 11 },
    alignment: { horizontal: 'left', vertical: 'middle' },
  });

  const headerRow = sheet.getRow(2);
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.label;
    styleCell(cell, {
      fill: COLORS.detailHeader,
      font: { bold: true, color: { argb: COLORS.white }, size: 10 },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    });
  });

  let rowNum = 3;
  if (!report.progress_rows.length) {
    const row = sheet.getRow(rowNum);
    sheet.mergeCells(rowNum, 1, rowNum, columns.length);
    const cell = row.getCell(1);
    cell.value = 'No progress updates recorded.';
    styleCell(cell, { alignment: { horizontal: 'center', vertical: 'middle' } });
    return;
  }

  for (const item of report.progress_rows) {
    const row = sheet.getRow(rowNum);
    columns.forEach((col, index) => {
      const cell = row.getCell(index + 1);
      cell.value = item[col.key] ?? '—';
      styleCell(cell, {
        alignment: {
          horizontal: col.key === 'progress_date' ? 'center' : 'left',
          vertical: 'top',
          wrapText: Boolean(col.wrap),
        },
      });
    });
    rowNum += 1;
  }
}

async function singleMouSifcReportToXlsx(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pakistan-China Investment Portal';
  workbook.created = new Date();

  buildMouDetailsSheet(workbook, report);
  buildProgressSheet(workbook, report);

  return workbook.xlsx.writeBuffer();
}

async function singleMouSifcReportToPdf(report) {
  const html = buildSingleMouSifcReportHtml(report);
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

module.exports = {
  singleMouSifcReportToXlsx,
  singleMouSifcReportToPdf,
};

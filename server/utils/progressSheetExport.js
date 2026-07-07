const ExcelJS = require('exceljs');
const { PROGRESS_SHEET_COLUMNS, formatProgressSheetRow } = require('./progressActivity');

function progressRowsToCsv(rows) {
  const headers = PROGRESS_SHEET_COLUMNS.map((column) => column.label);
  const lines = [headers.join(',')];

  rows.forEach((row) => {
    const values = PROGRESS_SHEET_COLUMNS.map((column) => {
      const raw = row[column.key] ?? '';
      const text = String(raw).replace(/"/g, '""');
      return `"${text}"`;
    });
    lines.push(values.join(','));
  });

  return `\uFEFF${lines.join('\n')}`;
}

async function progressRowsToXlsx(rows, proposalTitle = 'MOU') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pakistan-China Investment Portal';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Progress Updates');
  sheet.columns = PROGRESS_SHEET_COLUMNS.map((column) => ({
    header: column.label,
    key: column.key,
    width: column.key === 'description' ? 48 : column.key === 'comments' ? 40 : 18,
  }));

  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  };

  rows.forEach((row) => {
    const excelRow = sheet.addRow(row);
    const commentsCell = excelRow.getCell('comments');
    commentsCell.alignment = { wrapText: true, vertical: 'top' };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  workbook.title = proposalTitle;
  return workbook.xlsx.writeBuffer();
}

function buildProgressSheetRows(activities) {
  return activities.map((activity) => formatProgressSheetRow(activity));
}

module.exports = {
  buildProgressSheetRows,
  progressRowsToCsv,
  progressRowsToXlsx,
};

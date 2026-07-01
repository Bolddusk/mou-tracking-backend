const path = require('path');
const ExcelJS = require('exceljs');
const { normalizeCooperationMode } = require('../constants/cooperationModes');
const { HANGZHOU_AGRI_2026, buildConferenceInfo } = require('../constants/conferences');

const DEFAULT_EXCEL = path.join(
  __dirname,
  '..',
  '..',
  'Revised Copy of Final Agri MOU List 15.06.2026.xlsx'
);

function cellText(cell) {
  if (!cell || cell.value == null) return '';
  const value = cell.value;
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((part) => part.text).join('');
  }
  if (typeof value === 'object' && value.text) return value.text;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parsePartySide(raw) {
  const text = String(raw || '')
    .replace(/\r/g, '')
    .trim();
  if (!text) return { company: '', signatory: '' };

  const slashIndex = text.lastIndexOf('/');
  if (slashIndex === -1) {
    const company = text.split('\n').map((line) => line.trim()).filter(Boolean)[0] || text;
    return { company, signatory: '' };
  }

  const company = text
    .slice(0, slashIndex)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0]
    .trim();
  const signatory = text
    .slice(slashIndex + 1)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0]
    .trim();

  return { company, signatory };
}

function mapSubSectorToPortalSector(subSector) {
  const value = String(subSector || '').toLowerCase();

  if (
    value.includes('seed') ||
    value.includes('fertilizer') ||
    value.includes('pesticide') ||
    value.includes('agri-chemical')
  ) {
    return 'Agri-chemicals & Inputs';
  }
  if (value.includes('dairy')) {
    return 'Dairy Inputs & Processed Dairy Products';
  }
  if (value.includes('meat') || value.includes('fmd')) {
    return 'Meat & Poultry Industry';
  }
  if (value.includes('fruit') || value.includes('vegetable')) {
    return 'Fruits & Vegetables (Production, Cultivation, Processing, Exports)';
  }
  if (value.includes('fisheries') || value.includes('aquaculture') || value.includes('shrimp')) {
    return 'Fisheries & Aquaculture (Including Processing)';
  }
  if (value.includes('animal vaccine') || value.includes('animal feed')) {
    return 'Animal Feed & Related Value Chains';
  }
  if (value.includes('grain silo') || value.includes('cold chain') || value.includes('logistics')) {
    return 'Cold Chain Systems & Agriculture Logistics';
  }
  if (
    value.includes('irrigation') ||
    value.includes('molecular') ||
    value.includes('technology') ||
    value.includes('trade development')
  ) {
    return 'Agri Technology & Precision Agriculture Solutions';
  }
  if (value.includes('forestry') || value.includes('food processing')) {
    return 'Food Processing & Value Addition';
  }

  return 'Agri-chemicals & Inputs';
}

function normalizeSignedCopyStatus(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'yes') return 'yes';
  if (value === 'awaited') return 'awaited';
  if (value === 'no') return 'no';
  return value || null;
}

function buildExternalReference(sr) {
  return `HANGZHOU-AGRI-${sr}`;
}

function buildVentureTitle(chineseCompany, pakistaniCompany, sr) {
  const left = chineseCompany || 'Chinese Partner';
  const right = pakistaniCompany || 'Pakistani Partner';
  const title = `${left} × ${right}`;
  return title.length > 250 ? `${title.slice(0, 247)}...` : title;
}

async function readAgriMouRows(excelPath = DEFAULT_EXCEL) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const worksheet = workbook.worksheets[0];
  const rows = [];

  for (let rowNumber = 4; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const sr = cellText(row.getCell(2));
    if (!/^\d+$/.test(sr)) continue;

    const chinese = parsePartySide(cellText(row.getCell(3)));
    const pakistani = parsePartySide(cellText(row.getCell(4)));
    const subSector = cellText(row.getCell(5));
    const mode = normalizeCooperationMode(cellText(row.getCell(6)));
    const investmentValue = cellText(row.getCell(7));
    const description = cellText(row.getCell(8));
    const signedCopy = normalizeSignedCopyStatus(cellText(row.getCell(9)));
    const jurisdiction = cellText(row.getCell(10));

    if (!mode) {
      throw new Error(`Row ${rowNumber} (Sr ${sr}): invalid cooperation mode`);
    }

    rows.push({
      sr,
      external_reference: buildExternalReference(sr),
      chinese_company: chinese.company,
      chinese_signatory: chinese.signatory,
      pakistani_company: pakistani.company,
      pakistani_signatory: pakistani.signatory,
      mou_sub_sector: subSector,
      sector: mapSubSectorToPortalSector(subSector),
      cooperation_mode: mode,
      investment_value_usd: investmentValue,
      description,
      signed_copy_status: signedCopy,
      jurisdiction,
      venture_name: buildVentureTitle(chinese.company, pakistani.company, sr),
    });
  }

  return rows;
}

function buildProposalRecord(row, partyAId, sectorLeadId) {
  const signedYes = row.signed_copy_status === 'yes';
  const submittedAt = new Date('2026-06-15T10:00:00.000Z');
  const conferenceInfo = buildConferenceInfo(HANGZHOU_AGRI_2026, {
    location: row.jurisdiction ? `${row.jurisdiction}, China` : HANGZHOU_AGRI_2026.location,
    description: `Historic signed ${row.cooperation_mode.toUpperCase()} imported from Agri MOU list (Sr ${row.sr}).`,
  });

  return {
    party_a_id: partyAId,
    engagement_type: 'B2B',
    cooperation_mode: row.cooperation_mode,
    conference_key: HANGZHOU_AGRI_2026.key,
    conference_name: HANGZHOU_AGRI_2026.name,
    external_reference: row.external_reference,
    investment_value_usd: row.investment_value_usd,
    mou_sub_sector: row.mou_sub_sector,
    jurisdiction: row.jurisdiction,
    signed_copy_status: row.signed_copy_status,
    conference_info: JSON.stringify(conferenceInfo),
    party_a_info: JSON.stringify({
      entity_type: 'business',
      organization_name: row.pakistani_company,
      contact_name: row.pakistani_signatory || row.pakistani_company,
      designation: '',
      email: '',
      phone: '',
      country: 'Pakistan',
      city: '',
    }),
    party_b_entity_type: 'business',
    sector: row.sector,
    company_name: row.pakistani_company,
    venture_name: row.venture_name,
    proposal_title: row.venture_name,
    project_type: 'Greenfield',
    executive_summary: JSON.stringify({
      company_overview: row.pakistani_company,
      project_overview: row.description || row.mou_sub_sector,
      project_segment: row.mou_sub_sector,
      sector_alignment: row.sector,
      investment_ask_summary: row.investment_value_usd
        ? `USD ${row.investment_value_usd} million`
        : '',
    }),
    proposal_description: row.description || row.mou_sub_sector,
    party_b_name: row.chinese_signatory || row.chinese_company,
    party_b_organization: row.chinese_company,
    party_b_email: null,
    party_b_phone: null,
    party_b_country: 'China',
    mou_scope: row.mou_sub_sector,
    mou_description: row.description || row.mou_sub_sector,
    mou_sector: row.sector,
    mou_demand: row.investment_value_usd
      ? `Estimated value: USD ${row.investment_value_usd} million`
      : null,
    mou_status: signedYes ? 'signed' : 'uploaded',
    mou_ack_exempt: 1,
    mou_ack_by_a: 1,
    mou_ack_by_a_at: submittedAt,
    mou_ack_by_b: 1,
    mou_ack_by_b_at: submittedAt,
    status: 'approved',
    reviewed_by: sectorLeadId,
    reviewed_at: submittedAt,
    submitted_at: submittedAt,
  };
}

module.exports = {
  DEFAULT_EXCEL,
  readAgriMouRows,
  buildProposalRecord,
  mapSubSectorToPortalSector,
  parsePartySide,
};

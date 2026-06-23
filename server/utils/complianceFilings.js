const FILING_TYPES = ['audit_report', 'annual_return'];

const FILING_TYPE_LABELS = {
  audit_report: 'Audit Report',
  annual_return: 'Annual Return',
};

function getRequiredFiscalYears(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  return [year - 1, year - 2, year - 3];
}

function isRequiredFiscalYear(year, referenceDate = new Date()) {
  const y = Number(year);
  return getRequiredFiscalYears(referenceDate).includes(y);
}

function isAllowedFilingType(type) {
  return FILING_TYPES.includes(String(type || '').trim());
}

function buildComplianceMatrix(filings, userId, referenceDate = new Date()) {
  const years = getRequiredFiscalYears(referenceDate);
  const byKey = new Map();
  for (const row of filings) {
    if (Number(row.user_id) !== Number(userId)) continue;
    byKey.set(`${row.fiscal_year}:${row.filing_type}`, row);
  }

  return years.map((fiscal_year) => ({
    fiscal_year,
    audit_report: byKey.get(`${fiscal_year}:audit_report`) || null,
    annual_return: byKey.get(`${fiscal_year}:annual_return`) || null,
  }));
}

function summarizeCompliance(filings, users, referenceDate = new Date()) {
  const years = getRequiredFiscalYears(referenceDate);
  const slotsPerUser = years.length * FILING_TYPES.length;
  const byUser = new Map();

  for (const row of filings) {
    const uid = Number(row.user_id);
    if (!byUser.has(uid)) byUser.set(uid, new Set());
    byUser.get(uid).add(`${row.fiscal_year}:${row.filing_type}`);
  }

  return users.map((user) => {
    const uploaded = byUser.get(Number(user.id)) || new Set();
    const uploaded_count = uploaded.size;
    return {
      user_id: Number(user.id),
      full_name: user.full_name,
      email: user.email,
      organization: user.organization,
      country: user.country,
      required_years: years,
      required_slots: slotsPerUser,
      uploaded_count,
      missing_count: slotsPerUser - uploaded_count,
      complete: uploaded_count === slotsPerUser,
    };
  });
}

module.exports = {
  FILING_TYPES,
  FILING_TYPE_LABELS,
  getRequiredFiscalYears,
  isRequiredFiscalYear,
  isAllowedFilingType,
  buildComplianceMatrix,
  summarizeCompliance,
};

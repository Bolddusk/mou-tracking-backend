const CHINESE_NAME_HINTS =
  /\b(ltd|co\.|limited|corp|corporation|group|technology|technologies|tech|henan|beijing|shanghai|guangzhou|shenzhen|jiangsu|zhejiang|china|xinjiang|suzhou|qingdao|wuxi|hangzhou|guangxi|shanxi|chengdu|guangdong|fujian|anhui|hubei|hunan|jiangxi|liaoning|jilin|heilongjiang|tianjin|chongqing|yunnan|sichuan|province|hong kong)\b/i;

const PAKISTANI_NAME_HINTS =
  /\b(pakistan|pakistani|lahore|karachi|islamabad|faisalabad|multan|peshawar|rawalpindi|sindh|punjab|baloch|khyber|sargodha|sheikhupura|pvt\.?\s*ltd|private limited|university of agriculture|university of sargodha|university, pakistan|pmas-arid|arid agriculture|parc|nfsr|ministry|chamber of commerce|green corporate|al-karam|feroz foods|rustam tea|commercial venture|green corporative|akin foods|pak agro|national food|livestock|nfs&r)\b/i;

function cleanCompanyName(value) {
  return String(value || '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreChinese(name) {
  const text = cleanCompanyName(name);
  if (!text) return 0;
  let score = 0;
  if (CHINESE_NAME_HINTS.test(text)) score += 2;
  if (/\bco\.,?\s*ltd\b/i.test(text)) score += 1;
  if (PAKISTANI_NAME_HINTS.test(text)) score -= 2;
  if (/,\s*pakistan\b/i.test(text)) score -= 4;
  return score;
}

function scorePakistani(name) {
  const text = cleanCompanyName(name);
  if (!text) return 0;
  let score = 0;
  if (PAKISTANI_NAME_HINTS.test(text)) score += 2;
  if (/,\s*pakistan\b/i.test(text)) score += 4;
  if (CHINESE_NAME_HINTS.test(text)) score -= 2;
  return score;
}

/** Fix rows where Excel columns were reversed (common in Islamabad sheet). */
function normalizeCompanyPair(chineseRaw, pakistaniRaw) {
  let chinese = cleanCompanyName(chineseRaw);
  let pakistani = cleanCompanyName(pakistaniRaw);

  const cnCn = scoreChinese(chinese);
  const cnPk = scorePakistani(chinese);
  const pkCn = scoreChinese(pakistani);
  const pkPk = scorePakistani(pakistani);

  const shouldSwap =
    (pkCn > pkPk && cnPk > cnCn) ||
    (pkCn >= 2 && cnPk >= 1 && pkPk <= 0) ||
    (cnPk >= 2 && pkCn >= 1 && cnCn <= 0) ||
    (pkCn >= 2 && pkPk <= 0 && cnCn <= cnPk) ||
    (cnPk >= 2 && cnCn <= 0 && pkCn <= pkPk);

  if (shouldSwap) {
    return { chinese: pakistani, pakistani: chinese, swapped: true };
  }

  return { chinese, pakistani, swapped: false };
}

function buildVentureTitle(chineseCompany, pakistaniCompany) {
  const title = `${chineseCompany} × ${pakistaniCompany}`;
  return title.length > 250 ? `${title.slice(0, 247)}...` : title;
}

/** Outcome/description only — progress, SIFC, etc. stay in executive_summary. */
function buildOutcomeDescription(row) {
  return String(row.outcome_description || row['Outcome / Description'] || '').trim();
}

function extractOutcomeFromStored(proposalDescription, executiveSummary) {
  if (executiveSummary?.project_overview) {
    return String(executiveSummary.project_overview).trim();
  }

  const text = String(proposalDescription || '').trim();
  if (!text) return '';

  const firstBlock = text.split('\n\n')[0].trim();
  if (/^sifc category:/i.test(firstBlock)) return '';
  return firstBlock;
}

module.exports = {
  cleanCompanyName,
  normalizeCompanyPair,
  buildVentureTitle,
  buildOutcomeDescription,
  extractOutcomeFromStored,
  scoreChinese,
  scorePakistani,
};

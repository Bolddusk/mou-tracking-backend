const {
  PORTFOLIO_CONFERENCES,
} = require('./portfolioSeed');

const PAK_CHINA_SEP_25_CONFERENCE = {
  key: PORTFOLIO_CONFERENCES[0].key,
  name: PORTFOLIO_CONFERENCES[0].name,
  date: PORTFOLIO_CONFERENCES[0].date,
  end_date: PORTFOLIO_CONFERENCES[0].end_date,
  location: PORTFOLIO_CONFERENCES[0].location,
  host: PORTFOLIO_CONFERENCES[0].host,
  report_title: PORTFOLIO_CONFERENCES[0].report_title,
  supports_report: PORTFOLIO_CONFERENCES[0].supports_report,
  engagement_type: PORTFOLIO_CONFERENCES[0].engagement_type,
  description: PORTFOLIO_CONFERENCES[0].description,
};

const MAY_2026_CHINA_B2B = {
  key: PORTFOLIO_CONFERENCES[1].key,
  name: PORTFOLIO_CONFERENCES[1].name,
  date: PORTFOLIO_CONFERENCES[1].date,
  end_date: PORTFOLIO_CONFERENCES[1].end_date,
  location: PORTFOLIO_CONFERENCES[1].location,
  host: PORTFOLIO_CONFERENCES[1].host,
  report_title: PORTFOLIO_CONFERENCES[1].report_title,
  supports_report: PORTFOLIO_CONFERENCES[1].supports_report,
  engagement_type: PORTFOLIO_CONFERENCES[1].engagement_type,
  description: PORTFOLIO_CONFERENCES[1].description,
};

const ISLAMABAD_AGRI_2026 = {
  key: PORTFOLIO_CONFERENCES[2].key,
  name: PORTFOLIO_CONFERENCES[2].name,
  date: PORTFOLIO_CONFERENCES[2].date,
  end_date: PORTFOLIO_CONFERENCES[2].end_date,
  location: PORTFOLIO_CONFERENCES[2].location,
  host: PORTFOLIO_CONFERENCES[2].host,
  report_title: PORTFOLIO_CONFERENCES[2].report_title,
  supports_report: PORTFOLIO_CONFERENCES[2].supports_report,
  engagement_type: PORTFOLIO_CONFERENCES[2].engagement_type,
  description: PORTFOLIO_CONFERENCES[2].description,
};

/** @deprecated Use MAY_2026_CHINA_B2B — kept for legacy import scripts */
const HANGZHOU_AGRI_2026 = MAY_2026_CHINA_B2B;

const KNOWN_CONFERENCES = [PAK_CHINA_SEP_25_CONFERENCE, MAY_2026_CHINA_B2B, ISLAMABAD_AGRI_2026];

function getConferenceByKey(key) {
  const { getConferenceFromCacheByKey } = require('../utils/conferenceRegistry');
  const cached = getConferenceFromCacheByKey(key);
  if (cached) return cached;
  return KNOWN_CONFERENCES.find((item) => item.key === key) || null;
}

function conferenceSupportsReport(key) {
  const conference = getConferenceByKey(key);
  return Boolean(conference?.supports_report);
}

function getReportableConference(key) {
  const conference = getConferenceByKey(key);
  if (!conference?.supports_report) return null;
  return conference;
}

function buildConferenceInfo(conference, overrides = {}) {
  return {
    conference_name: conference.name,
    conference_date: conference.date || conference.conference_date || '',
    conference_end_date: conference.end_date || conference.conference_end_date || '',
    conference_location: overrides.location || conference.location || '',
    conference_host: conference.host || '',
    conference_description:
      conference.description ||
      overrides.description ||
      `Historic signed records imported for ${conference.name}.`,
  };
}

module.exports = {
  HANGZHOU_AGRI_2026,
  MAY_2026_CHINA_B2B,
  ISLAMABAD_AGRI_2026,
  PAK_CHINA_SEP_25_CONFERENCE,
  KNOWN_CONFERENCES,
  getConferenceByKey,
  conferenceSupportsReport,
  getReportableConference,
  buildConferenceInfo,
};

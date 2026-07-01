const HANGZHOU_AGRI_2026 = {
  key: 'pak-china-hangzhou-agri-2026',
  name: 'PAKISTAN-CHINA ICT&BESS and Agriculture B2B Investment Conference, Hangzhou',
  date: '2026-06-15',
  end_date: '2026-06-15',
  location: 'Hangzhou, China',
  host: 'Government of Pakistan',
};

const ISLAMABAD_AGRI_2026 = {
  key: 'pak-china-islamabad-agri-2026',
  name: 'PAKISTAN-CHINA Agriculture B2B Investment Conference, Islamabad',
  date: '2026-06-12',
  end_date: '2026-06-12',
  location: 'Islamabad, Pakistan',
  host: 'Government of Pakistan',
};

const KNOWN_CONFERENCES = [HANGZHOU_AGRI_2026, ISLAMABAD_AGRI_2026];

function getConferenceByKey(key) {
  return KNOWN_CONFERENCES.find((item) => item.key === key) || null;
}

function buildConferenceInfo(conference, overrides = {}) {
  return {
    conference_name: conference.name,
    conference_date: conference.date,
    conference_end_date: conference.end_date,
    conference_location: overrides.location || conference.location,
    conference_host: conference.host,
    conference_description:
      overrides.description ||
      `Historic signed records imported for ${conference.name}.`,
  };
}

module.exports = {
  HANGZHOU_AGRI_2026,
  ISLAMABAD_AGRI_2026,
  KNOWN_CONFERENCES,
  getConferenceByKey,
  buildConferenceInfo,
};

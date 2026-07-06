const { normalizeEmail } = require('./emailNormalize');

const PARTY_B_INFO_FIELDS = [
  'entity_type',
  'organization_name',
  'department_ministry',
  'contact_name',
  'designation',
  'email',
  'phone',
  'country',
  'city',
];

const EMPTY_PARTY_B_INFO = {
  entity_type: '',
  organization_name: '',
  department_ministry: '',
  contact_name: '',
  designation: '',
  email: '',
  phone: '',
  country: '',
  city: '',
};

const LEGACY_FLAT_TO_INFO = {
  party_b_entity_type: 'entity_type',
  party_b_organization: 'organization_name',
  party_b_name: 'contact_name',
  party_b_email: 'email',
  party_b_phone: 'phone',
  party_b_country: 'country',
};

function parsePartyBInfo(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

function normalizePartyBInfoField(key, value) {
  let next = value === null || value === undefined ? '' : String(value).trim();
  if (key === 'email' && next) {
    next = normalizeEmail(next);
  }
  return next;
}

function buildPartyBInfoFromRow(row) {
  if (!row) return { ...EMPTY_PARTY_B_INFO };

  const stored = parsePartyBInfo(row.party_b_info);
  const fromFlat = {
    entity_type: row.party_b_entity_type || '',
    organization_name: row.party_b_organization || '',
    department_ministry: '',
    contact_name: row.party_b_name || '',
    designation: '',
    email: row.party_b_email || '',
    phone: row.party_b_phone || '',
    country: row.party_b_country || '',
    city: '',
  };

  const merged = { ...EMPTY_PARTY_B_INFO };

  PARTY_B_INFO_FIELDS.forEach((key) => {
    const storedVal = stored[key];
    const flatVal = fromFlat[key];
    if (storedVal !== undefined && storedVal !== null && String(storedVal).trim() !== '') {
      merged[key] = normalizePartyBInfoField(key, storedVal);
    } else if (flatVal !== undefined && flatVal !== null && String(flatVal).trim() !== '') {
      merged[key] = normalizePartyBInfoField(key, flatVal);
    }
  });

  return merged;
}

function syncFlatColumnsFromPartyBInfo(info) {
  const i = info || {};
  const email = i.email ? normalizeEmail(i.email) : null;
  return {
    party_b_entity_type: i.entity_type || null,
    party_b_name: i.contact_name || null,
    party_b_organization: i.organization_name || null,
    party_b_email: email,
    party_b_phone: i.phone || null,
    party_b_country: i.country || null,
  };
}

function mergePartyBInfoPatch(existingInfo, patch) {
  const next = { ...EMPTY_PARTY_B_INFO, ...parsePartyBInfo(existingInfo) };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return next;
  }

  PARTY_B_INFO_FIELDS.forEach((key) => {
    if (patch[key] !== undefined) {
      next[key] = normalizePartyBInfoField(key, patch[key]);
    }
  });

  return next;
}

function applyLegacyPartyBFlatPatch(info, body) {
  if (!body || typeof body !== 'object') return info;
  const next = { ...info };

  Object.entries(LEGACY_FLAT_TO_INFO).forEach(([flatKey, infoKey]) => {
    if (body[flatKey] !== undefined) {
      next[infoKey] = normalizePartyBInfoField(infoKey, body[flatKey]);
    }
  });

  return next;
}

function buildPartyBContactUpdates(body, existingProposal) {
  const existingInfo = buildPartyBInfoFromRow(existingProposal);
  const hasPartyBInfo =
    body.party_b_info !== undefined && typeof body.party_b_info === 'object' && !Array.isArray(body.party_b_info);
  const hasLegacyFlat = Object.keys(LEGACY_FLAT_TO_INFO).some((key) => body[key] !== undefined);

  if (!hasPartyBInfo && !hasLegacyFlat) {
    return null;
  }

  let nextInfo = mergePartyBInfoPatch(existingInfo, hasPartyBInfo ? body.party_b_info : {});
  nextInfo = applyLegacyPartyBFlatPatch(nextInfo, body);

  const updates = {
    party_b_info: JSON.stringify(nextInfo),
    ...syncFlatColumnsFromPartyBInfo(nextInfo),
  };

  if (body.party_b_info?.organization_name !== undefined && nextInfo.organization_name) {
    updates.venture_name = nextInfo.organization_name;
  } else if (body.party_b_organization !== undefined && nextInfo.organization_name) {
    updates.venture_name = nextInfo.organization_name;
  }

  return { nextInfo, updates };
}

module.exports = {
  PARTY_B_INFO_FIELDS,
  EMPTY_PARTY_B_INFO,
  LEGACY_FLAT_TO_INFO,
  parsePartyBInfo,
  buildPartyBInfoFromRow,
  syncFlatColumnsFromPartyBInfo,
  mergePartyBInfoPatch,
  applyLegacyPartyBFlatPatch,
  buildPartyBContactUpdates,
};

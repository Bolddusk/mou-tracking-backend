const { normalizeCooperationMode, COOPERATION_MODES } = require('../constants/cooperationModes');
const { getActiveSectorNames } = require('./sectorRegistry');
const {
  isValidActiveConferenceKey,
  getConferenceFromCacheByKey,
} = require('./conferenceRegistry');
const { isValidActiveSifcCategory } = require('./sifcCategoryRegistry');
const { buildConferenceInfo } = require('../constants/conferences');
const {
  JSON_FIELDS,
  SCALAR_DRAFT_FIELDS,
  PROJECT_TYPES,
  ENGAGEMENT_TYPES,
  ENTITY_TYPES,
  enrichProposalRow,
  buildDraftUpdates,
  parseJsonField,
  stringifyJsonFields,
  sanitizeEnumField,
} = require('./proposalTemplate');

const MOU_STATUSES = ['not_started', 'in_progress', 'uploaded', 'signed', 'deal_closed'];

const EXTRA_SCALAR_FIELDS = [
  'proposal_description',
  'cooperation_mode',
  'conference_key',
  'investment_value_usd',
  'mou_sub_sector',
  'jurisdiction',
  'signed_copy_status',
  'mou_status',
  'sector_lead_comment',
];

/** Not editable via MOU full-field edit — use company_name / party-contacts instead. */
const EXCLUDED_PARTY_A_INFO_KEYS = ['organization_name'];

/** conference_name is synced from conference_key lookup — not a free-text field. */
const READ_ONLY_LOOKUP_SCALAR_FIELDS = new Set(['conference_name']);

const EXECUTIVE_SUMMARY_KEYS = [
  'company_overview',
  'project_overview',
  'project_segment',
  'sector_alignment',
  'investment_ask_summary',
  'sifc_category',
  'mou_operational_status',
  'current_status',
  'bottlenecks',
  'tentative_timeline',
  'action_taken',
  'location',
  'collaboration_type',
  'collaboration_dropped',
  'in_execution',
  'source_sr_no',
  'source_seq',
];

/** Progress is updated only via Progress tab — not Edit MOU fields. */
const READ_ONLY_EXECUTIVE_SUMMARY_KEYS = new Set(['progress']);

const ADMIN_ONLY_SCALAR_FIELDS = new Set(['external_reference', 'sector']);

const SECTOR_CHANGE_ROLES = new Set(['super_admin', 'admin']);

function canChangeProposalSector(user) {
  return SECTOR_CHANGE_ROLES.has(user?.role);
}

const READ_ONLY_SYSTEM_FIELDS = new Set([
  'id',
  'party_a_id',
  'party_b_user_id',
  'reviewed_by',
  'reviewed_at',
  'submitted_at',
  'created_at',
  'deal_closed_at',
  'deal_closed_by',
  'mou_uploaded_at',
  'mou_uploaded_by',
  'mou_ack_by_a',
  'mou_ack_by_a_at',
  'mou_ack_by_b',
  'mou_ack_by_b_at',
  'resubmit_count',
  'last_resubmitted_at',
  'status',
]);

function mergeJsonPatch(existingValue, patch, fallback = {}) {
  const base = parseJsonField(existingValue, fallback);
  if (patch === null) return null;
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }
  return { ...base, ...patch };
}

function stripExcludedPartyAInfo(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const next = { ...patch };
  EXCLUDED_PARTY_A_INFO_KEYS.forEach((key) => {
    delete next[key];
  });
  return next;
}

function applyConferenceKeyUpdate(updates, conferenceKey) {
  const key = String(conferenceKey || '').trim();
  if (!key) {
    return { error: 'conference_key cannot be empty', status: 400 };
  }
  if (!isValidActiveConferenceKey(key)) {
    return { error: 'Invalid conference_key — choose from active conferences list', status: 400 };
  }

  const conference = getConferenceFromCacheByKey(key);
  if (!conference) {
    return { error: 'Invalid conference_key — choose from active conferences list', status: 400 };
  }

  updates.conference_key = key;
  updates.conference_name = conference.name;
  updates.conference_info = buildConferenceInfo(conference);
  if (conference.engagement_type) {
    updates.engagement_type = conference.engagement_type;
  }
  return { updates };
}

const PARTY_B_FIELD_KEYS = [
  'party_b_info',
  'party_b_email',
  'party_b_name',
  'party_b_phone',
  'party_b_country',
  'party_b_city',
  'party_b_organization',
  'party_b_contact_name',
  'party_b_designation',
  'party_b_entity_type',
];

const PARTY_A_CONTACT_FIELD_KEYS = ['party_a_info', 'company_name'];

function buildProposalFieldUpdates(body, existingRow, user) {
  if (body.sector !== undefined && !canChangeProposalSector(user)) {
    return { error: 'Only admin and super admin can change sector', status: 403 };
  }

  const sanitizedBody = { ...body };

  // Each party edits own side on Companies — block cross-side via Edit MOU fields
  if (user?.role === 'party_a') {
    const triedPartyB = PARTY_B_FIELD_KEYS.some((key) => sanitizedBody[key] !== undefined);
    if (triedPartyB) {
      return { error: 'You cannot edit Party B contacts', status: 403 };
    }
  }
  if (user?.role === 'party_b') {
    const triedPartyA = PARTY_A_CONTACT_FIELD_KEYS.some((key) => sanitizedBody[key] !== undefined);
    if (triedPartyA) {
      return { error: 'You cannot edit Party A contacts', status: 403 };
    }
  }

  if (sanitizedBody.party_a_info !== undefined) {
    sanitizedBody.party_a_info = stripExcludedPartyAInfo(sanitizedBody.party_a_info);
    if (
      sanitizedBody.party_a_info &&
      typeof sanitizedBody.party_a_info === 'object' &&
      !Array.isArray(sanitizedBody.party_a_info) &&
      !Object.keys(sanitizedBody.party_a_info).length
    ) {
      delete sanitizedBody.party_a_info;
    }
  }

  if (sanitizedBody.conference_name !== undefined && sanitizedBody.conference_key === undefined) {
    return {
      error: 'conference_name is read-only — send conference_key from the conferences dropdown',
      status: 400,
    };
  }

  const enriched = enrichProposalRow(existingRow);
  const updates = { ...buildDraftUpdates(sanitizedBody) };

  for (const field of EXTRA_SCALAR_FIELDS) {
    if (sanitizedBody[field] !== undefined) {
      updates[field] = sanitizedBody[field];
    }
  }

  if (sanitizedBody.conference_key !== undefined) {
    const conferenceResult = applyConferenceKeyUpdate(updates, sanitizedBody.conference_key);
    if (conferenceResult.error) return conferenceResult;
  }

  if (body.cooperation_mode !== undefined) {
    const mode = normalizeCooperationMode(body.cooperation_mode);
    if (!mode) {
      return { error: `Invalid cooperation_mode. Use: ${COOPERATION_MODES.join(', ')}`, status: 400 };
    }
    updates.cooperation_mode = mode;
  }

  if (body.project_type !== undefined) {
    const projectType = sanitizeEnumField(body.project_type, PROJECT_TYPES);
    if (projectType === undefined && String(body.project_type || '').trim()) {
      return { error: `Invalid project_type. Use: ${PROJECT_TYPES.join(', ')}`, status: 400 };
    }
    updates.project_type = projectType;
  }

  if (body.mou_status !== undefined) {
    if (!MOU_STATUSES.includes(body.mou_status)) {
      return { error: `Invalid mou_status. Use: ${MOU_STATUSES.join(', ')}`, status: 400 };
    }
    updates.mou_status = body.mou_status;
  }

  if (body.external_reference !== undefined) {
    if (!['super_admin', 'admin'].includes(user?.role)) {
      return { error: 'Only admin can change external_reference', status: 403 };
    }
    updates.external_reference = body.external_reference || null;
  }

  if (body.sector !== undefined) {
    const sector = String(body.sector || '').trim();
    if (!sector) {
      return { error: 'sector cannot be empty', status: 400 };
    }
    const active = getActiveSectorNames();
    if (!active.includes(sector)) {
      return { error: 'Invalid sector', status: 400 };
    }
    updates.sector = sector;
  }

  for (const field of JSON_FIELDS) {
    if (sanitizedBody[field] !== undefined) {
      let patch = sanitizedBody[field];
      if (field === 'executive_summary' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
        patch = { ...patch };
        READ_ONLY_EXECUTIVE_SUMMARY_KEYS.forEach((key) => {
          delete patch[key];
        });
        if (patch.sifc_category !== undefined) {
          const category = String(patch.sifc_category || '').trim();
          if (category && !isValidActiveSifcCategory(category)) {
            return {
              error: 'Invalid sifc_category — choose from active SIFC categories list',
              status: 400,
            };
          }
        }
      }

      const fallback =
        field === 'executive_summary'
          ? enriched.executive_summary
          : enriched[field] || {};
      updates[field] = mergeJsonPatch(enriched[field], patch, fallback);
    }
  }

  if (updates.venture_name || updates.company_name) {
    updates.proposal_title = updates.venture_name || updates.company_name || enriched.proposal_title;
  }

  return { updates: stringifyJsonFields(updates) };
}

function getEditableFieldCatalog() {
  return {
    scalar_fields: [
      ...SCALAR_DRAFT_FIELDS,
      ...EXTRA_SCALAR_FIELDS,
      'external_reference',
    ].filter((f) => !READ_ONLY_SYSTEM_FIELDS.has(f) && !READ_ONLY_LOOKUP_SCALAR_FIELDS.has(f)),
    json_fields: JSON_FIELDS,
    executive_summary_keys: EXECUTIVE_SUMMARY_KEYS,
    read_only_executive_summary_keys: [...READ_ONLY_EXECUTIVE_SUMMARY_KEYS],
    excluded_party_a_info_keys: [...EXCLUDED_PARTY_A_INFO_KEYS],
    lookup_fields: {
      conference_key: {
        source: 'conferences',
        value_field: 'key',
        label_field: 'name',
        sync_scalar_fields: ['conference_name'],
        sync_json_fields: ['conference_info'],
      },
      'executive_summary.sifc_category': {
        source: 'sifc_categories',
        value_field: 'name',
        label_field: 'name',
      },
    },
    read_only_lookup_scalar_fields: [...READ_ONLY_LOOKUP_SCALAR_FIELDS],
    enums: {
      engagement_type: ENGAGEMENT_TYPES,
      party_b_entity_type: ENTITY_TYPES,
      project_type: PROJECT_TYPES,
      cooperation_mode: COOPERATION_MODES,
      mou_status: MOU_STATUSES,
      mou_operational_status: ['Active', 'Inactive', 'In Execution'],
    },
    admin_only_fields: [...ADMIN_ONLY_SCALAR_FIELDS],
    read_only_system_fields: [...READ_ONLY_SYSTEM_FIELDS],
  };
}

module.exports = {
  buildProposalFieldUpdates,
  getEditableFieldCatalog,
  canChangeProposalSector,
  EXECUTIVE_SUMMARY_KEYS,
  READ_ONLY_EXECUTIVE_SUMMARY_KEYS,
  READ_ONLY_SYSTEM_FIELDS,
  EXCLUDED_PARTY_A_INFO_KEYS,
  ADMIN_ONLY_SCALAR_FIELDS,
};

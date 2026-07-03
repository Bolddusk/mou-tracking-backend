const { normalizeCooperationMode, COOPERATION_MODES } = require('../constants/cooperationModes');
const { getActiveSectorNames } = require('./sectorRegistry');
const { sectorLeadCoversSector } = require('./sectorLeadAssignments');
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
  'conference_name',
  'investment_value_usd',
  'mou_sub_sector',
  'jurisdiction',
  'signed_copy_status',
  'mou_status',
  'sector_lead_comment',
];

const EXECUTIVE_SUMMARY_KEYS = [
  'company_overview',
  'project_overview',
  'project_segment',
  'sector_alignment',
  'investment_ask_summary',
  'sifc_category',
  'mou_operational_status',
  'current_status',
  'progress',
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

const ADMIN_ONLY_SCALAR_FIELDS = new Set(['external_reference']);

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

function buildProposalFieldUpdates(body, existingRow, user) {
  const enriched = enrichProposalRow(existingRow);
  const updates = { ...buildDraftUpdates(body) };

  for (const field of EXTRA_SCALAR_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
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
    if (user?.role === 'sector_lead' && !sectorLeadCoversSector(user, sector)) {
      return { error: 'Sector lead cannot assign proposal outside assigned sectors', status: 403 };
    }
    updates.sector = sector;
  }

  for (const field of JSON_FIELDS) {
    if (body[field] !== undefined) {
      const fallback =
        field === 'executive_summary'
          ? enriched.executive_summary
          : enriched[field] || {};
      updates[field] = mergeJsonPatch(enriched[field], body[field], fallback);
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
    ].filter((f) => !READ_ONLY_SYSTEM_FIELDS.has(f)),
    json_fields: JSON_FIELDS,
    executive_summary_keys: EXECUTIVE_SUMMARY_KEYS,
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
  EXECUTIVE_SUMMARY_KEYS,
  READ_ONLY_SYSTEM_FIELDS,
};

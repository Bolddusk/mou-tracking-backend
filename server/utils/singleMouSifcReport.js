const pool = require('../config/db');
const {
  formatCommentsForReport,
  formatProgressSheetRow,
  filterProgressTabActivities,
  POKE_TITLE,
} = require('./progressActivity');

const PROGRESS_COLUMNS = [
  { key: 'progress_date', label: 'Progress Date', width: 14 },
  { key: 'title', label: 'Title', width: 24 },
  { key: 'description', label: 'Description', width: 36, wrap: true },
  { key: 'source_label', label: 'Source', width: 14 },
  { key: 'added_by_name', label: 'Added By', width: 22 },
  { key: 'added_by_role', label: 'Added By Role', width: 14 },
  { key: 'synced_fields', label: 'Synced Fields', width: 32, wrap: true },
  { key: 'comments', label: 'Comments', width: 40, wrap: true },
  { key: 'support_file_url', label: 'Support File URL', width: 28 },
];

function displayText(value, fallback = '—') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function formatMouValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value).trim();
  if (/undisclosed/i.test(raw)) return 'Undisclosed';
  const num = Number(raw.replace(/,/g, ''));
  if (Number.isFinite(num) && num > 0) return `USD ${num} million`;
  return raw;
}

function parseSyncedFields(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatSyncedFields(synced) {
  if (!synced?.length) return '';
  return synced
    .map((change) => {
      const label = change.label || change.field || 'Field';
      const oldValue = change.old_value ?? '—';
      const newValue = change.new_value ?? '—';
      return `${label}: ${oldValue} → ${newValue}`;
    })
    .join('\n');
}

async function fetchActivitiesForReport(proposalId) {
  const [rows] = await pool.query(
    `SELECT a.*, u.full_name AS added_by_name
     FROM proposal_activities a
     JOIN users u ON u.id = a.added_by
     WHERE a.proposal_id = ?
     ORDER BY a.activity_date ASC, a.created_at ASC`,
    [proposalId]
  );

  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const [comments] = await pool.query(
    `SELECT c.*, u.full_name AS commented_by_name
     FROM activity_comments c
     JOIN users u ON u.id = c.commented_by
     WHERE c.activity_id IN (?)
     ORDER BY c.created_at ASC`,
    [ids]
  );

  return filterProgressTabActivities(
    rows
      .filter((row) => row.title !== POKE_TITLE)
      .map((activity) => {
        const activityDate = activity.activity_date
          ? new Date(activity.activity_date).toISOString().slice(0, 10)
          : null;

        const synced = parseSyncedFields(activity.synced_fields);
        const activityComments = comments.filter((c) => c.activity_id === activity.id);

        return {
          ...activity,
          activity_date: activityDate,
          progress_date: activityDate,
          source: activity.source || 'manual',
          synced_fields: synced,
          comments: activityComments,
        };
      })
  );
}

function buildMouDetailsRows(proposal, conference) {
  const exec = proposal.executive_summary || {};
  const partyA = proposal.party_a_info || {};
  const partyB = proposal.party_b_info || {};

  return [
    { field: 'Proposal ID', value: String(proposal.id) },
    { field: 'Conference', value: displayText(conference?.name || proposal.conference_name) },
    { field: 'Chinese Company', value: displayText(proposal.party_b_name) },
    {
      field: 'Pakistani Company',
      value: displayText(proposal.company_name || partyA.organization_name || proposal.party_a_organization),
    },
    { field: 'SIFC Category', value: displayText(exec.sifc_category) },
    { field: 'Sector', value: displayText(proposal.sector) },
    { field: 'Cooperation Mode', value: displayText(proposal.cooperation_mode || 'mou') },
    { field: 'MOU Value', value: formatMouValue(proposal.investment_value_usd) },
    { field: 'Status', value: displayText(exec.mou_operational_status) },
    {
      field: 'Outcome / Description',
      value: displayText(proposal.proposal_description || exec.project_overview),
    },
    { field: 'Progress', value: displayText(exec.progress) },
    { field: 'Bottleneck', value: displayText(exec.bottlenecks, 'Nil') },
    { field: 'Tentative Timelines', value: displayText(exec.tentative_timeline, 'Not specified') },
    { field: 'Location', value: displayText(exec.location) },
    { field: 'Current Status', value: displayText(exec.current_status) },
    { field: 'Action Taken', value: displayText(exec.action_taken) },
    {
      field: 'Party A Contact',
      value: displayText(partyA.contact_name || partyA.organization_name),
    },
    {
      field: 'Party B Contact',
      value: displayText(partyB.contact_name || proposal.party_b_contact_name),
    },
    { field: 'Workflow Status', value: displayText(proposal.status) },
    { field: 'Submitted At', value: displayText(proposal.submitted_at) },
  ];
}

function buildProgressReportRows(activities) {
  return activities.map((activity) => {
    const base = formatProgressSheetRow(activity);
    return {
      ...base,
      source_label: activity.source === 'mou_field_sync' ? 'MOU fields' : 'Manual entry',
      synced_fields: formatSyncedFields(activity.synced_fields),
      comments: formatCommentsForReport(activity.comments),
    };
  });
}

function buildSingleMouConferenceMeta(proposal, conference) {
  const pakCompany =
    proposal.company_name ||
    proposal.party_a_info?.organization_name ||
    proposal.party_a_organization ||
    `MOU-${proposal.id}`;

  if (conference) {
    return {
      key: conference.key,
      name: conference.name,
      report_title: `${conference.report_title || conference.name} — ${pakCompany}`,
    };
  }

  return {
    key: null,
    name: proposal.sector || 'MOU Record',
    report_title: `${pakCompany} — SIFC MOU Report`,
  };
}

async function buildSingleMouSifcReport(proposal, conference = null) {
  const activities = await fetchActivitiesForReport(proposal.id);
  const conferenceMeta = buildSingleMouConferenceMeta(proposal, conference);
  const exec = proposal.executive_summary || {};

  return {
    report_type: 'single_mou',
    single_mou: true,
    conference: conferenceMeta,
    proposal: {
      id: proposal.id,
      pak_company: proposal.company_name || proposal.party_a_info?.organization_name || null,
      chinese_company: proposal.party_b_name || null,
      sector: proposal.sector || null,
      sifc_category: exec.sifc_category || null,
      mou_operational_status: exec.mou_operational_status || null,
      progress: exec.progress || null,
    },
    generated_at: new Date().toISOString(),
    mou_details: buildMouDetailsRows(proposal, conference),
    progress_columns: PROGRESS_COLUMNS,
    progress_rows: buildProgressReportRows(activities),
    progress_count: activities.length,
  };
}

module.exports = {
  PROGRESS_COLUMNS,
  buildSingleMouSifcReport,
  buildMouDetailsRows,
  buildProgressReportRows,
  fetchActivitiesForReport,
  formatSyncedFields,
};

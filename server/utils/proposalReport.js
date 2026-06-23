const pool = require('../config/db');
const { enrichProposalRow } = require('./proposalTemplate');

const PROPOSAL_SELECT = `
  SELECT
    p.*,
    pa.full_name AS party_a_name,
    pa.email AS party_a_email,
    pa.organization AS party_a_organization,
    pa.phone AS party_a_phone,
    pb.full_name AS party_b_linked_name,
    pb.email AS party_b_linked_email,
    rv.full_name AS reviewed_by_name
  FROM proposals p
  JOIN users pa ON pa.id = p.party_a_id
  LEFT JOIN users pb ON pb.id = p.party_b_user_id
  LEFT JOIN users rv ON rv.id = p.reviewed_by
`;

const ACTIVITY_SELECT = `
  SELECT a.*,
    u.full_name AS added_by_name,
    ru.full_name AS response_by_name
  FROM proposal_activities a
  JOIN users u ON u.id = a.added_by
  LEFT JOIN users ru ON ru.id = a.response_by
`;

async function getProposalForReport(proposalId) {
  const [rows] = await pool.query(`${PROPOSAL_SELECT} WHERE p.id = ?`, [proposalId]);
  return rows[0] || null;
}

async function getActivitiesForReport(proposalId) {
  const [rows] = await pool.query(
    `${ACTIVITY_SELECT} WHERE a.proposal_id = ?
     ORDER BY a.activity_date ASC, a.created_at ASC`,
    [proposalId]
  );
  if (!rows.length) return [];

  const ids = rows.map((a) => a.id);

  const [comments] = await pool.query(
    `SELECT c.*, u.full_name AS commented_by_name
     FROM activity_comments c
     JOIN users u ON u.id = c.commented_by
     WHERE c.activity_id IN (?)
     ORDER BY c.created_at ASC`,
    [ids]
  );

  const [approvals] = await pool.query(
    `SELECT ap.*, u.full_name AS action_by_name
     FROM activity_approvals ap
     JOIN users u ON u.id = ap.action_by
     WHERE ap.activity_id IN (?)
     ORDER BY ap.actioned_at ASC`,
    [ids]
  );

  return rows.map((activity) => ({
    id: activity.id,
    activity_date: activity.activity_date
      ? new Date(activity.activity_date).toISOString().slice(0, 10)
      : null,
    title: activity.title,
    description: activity.description || '',
    status: activity.status,
    added_by_name: activity.added_by_name,
    added_by_role: activity.added_by_role,
    support_file_url: activity.support_file_url || null,
    created_at: activity.created_at,
    is_poke: activity.title === 'Update Requested',
    poke_response: activity.response_submitted_at
      ? {
          work_date: activity.response_date
            ? new Date(activity.response_date).toISOString().slice(0, 10)
            : null,
          title: activity.response_title || '',
          description: activity.response_description || '',
          submitted_at: activity.response_submitted_at,
          submitted_by_name: activity.response_by_name || '',
        }
      : null,
    comments: comments
      .filter((c) => c.activity_id === activity.id)
      .map((c) => ({
        id: c.id,
        text: c.comment,
        author_name: c.commented_by_name,
        author_role: c.commented_by_role,
        created_at: c.created_at,
      })),
    approvals: approvals
      .filter((a) => a.activity_id === activity.id)
      .map((a) => ({
        action: a.action,
        comment: a.comment || '',
        action_by_name: a.action_by_name,
        action_by_role: a.action_by_role,
        actioned_at: a.actioned_at,
      })),
  }));
}

function formatUsd(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(String(value).replace(/,/g, ''));
  if (Number.isNaN(num)) return String(value);
  return num;
}

function buildOverview(proposal) {
  const exec = proposal.executive_summary || {};
  const company = proposal.company_overview || {};
  const project = proposal.project_overview || {};

  return {
    executive_summary: exec,
    company_overview: company,
    project_overview: project,
    venture_name: proposal.venture_name || proposal.display_title,
    company_name: proposal.company_name || '',
    project_type: proposal.project_type || '',
    mou_scope: proposal.mou_scope || '',
    mou_description: proposal.mou_description || '',
    engagement_type: proposal.engagement_type || '',
    conference_name: proposal.conference_info?.conference_name || '',
  };
}

function buildValue(proposal) {
  const ask = proposal.investment_ask || {};
  const exec = proposal.executive_summary || {};

  return {
    investment_ask_summary: exec.investment_ask_summary || '',
    total_project_cost_usd: formatUsd(ask.total_project_cost_usd),
    investment_ask_equity_usd: formatUsd(ask.investment_ask_equity_usd),
    investment_ask_debt_usd: formatUsd(ask.investment_ask_debt_usd),
    total_funds_required_pkr_mn: ask.total_funds_required_pkr_mn || '',
    sponsor_contribution_pkr_mn: ask.sponsor_contribution_pkr_mn || '',
    raising_from_investors_pkr_mn: ask.raising_from_investors_pkr_mn || '',
    projected_irr_pct: ask.projected_irr_pct || '',
    payback_period_years: ask.payback_period_years || '',
  };
}

function buildParties(proposal) {
  const partyAInfo = proposal.party_a_info || {};

  return {
    party_a: {
      name: partyAInfo.contact_name || proposal.party_a_name || '',
      organization: partyAInfo.organization_name || proposal.party_a_organization || '',
      email: partyAInfo.email || proposal.party_a_email || '',
      phone: partyAInfo.phone || proposal.party_a_phone || '',
      entity_type: partyAInfo.entity_type || '',
      country: partyAInfo.country || '',
      city: partyAInfo.city || '',
    },
    party_b: {
      name: proposal.party_b_name || proposal.party_b_linked_name || '',
      organization: proposal.party_b_organization || '',
      email: proposal.party_b_email || proposal.party_b_linked_email || '',
      phone: proposal.party_b_phone || '',
      country: proposal.party_b_country || '',
      entity_type: proposal.party_b_entity_type || '',
    },
  };
}

async function buildProposalReport(proposalId, requestedBy) {
  const row = await getProposalForReport(proposalId);
  if (!row) return null;

  const proposal = enrichProposalRow(row);
  const activities = await getActivitiesForReport(proposalId);

  return {
    generated_at: new Date().toISOString(),
    generated_by: {
      id: requestedBy.id,
      name: requestedBy.full_name,
      role: requestedBy.role,
    },
    proposal: {
      id: proposal.id,
      title: proposal.display_title,
      venture_name: proposal.venture_name || '',
      status: proposal.status,
      sector: proposal.sector || '',
      engagement_type: proposal.engagement_type || '',
      submitted_at: proposal.submitted_at || null,
      reviewed_at: proposal.reviewed_at || null,
      reviewed_by_name: proposal.reviewed_by_name || '',
      sector_lead_comment: proposal.sector_lead_comment || '',
    },
    parties: buildParties(proposal),
    value: buildValue(proposal),
    overview: buildOverview(proposal),
    updates: activities,
    summary: {
      total_activities: activities.length,
      approved_activities: activities.filter((a) => a.status === 'approved').length,
      pending_activities: activities.filter((a) => a.status === 'pending').length,
      rejected_activities: activities.filter((a) => a.status === 'rejected').length,
    },
  };
}

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCommentsForCsv(comments) {
  if (!comments?.length) return '';
  return comments
    .map((c) => {
      const date = c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '';
      return `${c.author_name} (${c.author_role}) [${date}]: ${c.text}`;
    })
    .join(' | ');
}

function formatApprovalsForCsv(approvals) {
  if (!approvals?.length) return '';
  return approvals
    .map((a) => {
      const date = a.actioned_at ? new Date(a.actioned_at).toISOString().slice(0, 10) : '';
      const comment = a.comment ? ` — ${a.comment}` : '';
      return `${a.action} by ${a.action_by_name} (${a.action_by_role}) [${date}]${comment}`;
    })
    .join(' | ');
}

function formatPokeResponseForCsv(pokeResponse) {
  if (!pokeResponse) return '';
  const parts = [
    pokeResponse.work_date ? `Date: ${pokeResponse.work_date}` : '',
    pokeResponse.title ? `Title: ${pokeResponse.title}` : '',
    pokeResponse.description ? `Description: ${pokeResponse.description}` : '',
    pokeResponse.submitted_by_name ? `By: ${pokeResponse.submitted_by_name}` : '',
  ].filter(Boolean);
  return parts.join(' | ');
}

function reportToCsv(report) {
  const lines = [];

  lines.push('PROPOSAL REPORT');
  lines.push('Field,Value');
  lines.push(`Proposal ID,${csvEscape(report.proposal.id)}`);
  lines.push(`Title,${csvEscape(report.proposal.title)}`);
  lines.push(`Status,${csvEscape(report.proposal.status)}`);
  lines.push(`Sector,${csvEscape(report.proposal.sector)}`);
  lines.push(`Engagement Type,${csvEscape(report.proposal.engagement_type)}`);
  lines.push(`Party A Name,${csvEscape(report.parties.party_a.name)}`);
  lines.push(`Party A Organization,${csvEscape(report.parties.party_a.organization)}`);
  lines.push(`Party A Email,${csvEscape(report.parties.party_a.email)}`);
  lines.push(`Party B Name,${csvEscape(report.parties.party_b.name)}`);
  lines.push(`Party B Organization,${csvEscape(report.parties.party_b.organization)}`);
  lines.push(`Party B Email,${csvEscape(report.parties.party_b.email)}`);
  lines.push(
    `Total Project Cost (USD),${csvEscape(report.value.total_project_cost_usd ?? '')}`
  );
  lines.push(
    `Investment Ask Equity (USD),${csvEscape(report.value.investment_ask_equity_usd ?? '')}`
  );
  lines.push(
    `Investment Ask Summary,${csvEscape(report.value.investment_ask_summary)}`
  );
  lines.push(
    `Executive — Company Overview,${csvEscape(report.overview.executive_summary?.company_overview)}`
  );
  lines.push(
    `Executive — Project Overview,${csvEscape(report.overview.executive_summary?.project_overview)}`
  );
  lines.push(
    `Project — Core Activity,${csvEscape(report.overview.project_overview?.core_activity)}`
  );
  lines.push(`MOU Description,${csvEscape(report.overview.mou_description)}`);
  lines.push(`Submitted At,${csvEscape(report.proposal.submitted_at)}`);
  lines.push(`Reviewed At,${csvEscape(report.proposal.reviewed_at)}`);
  lines.push(`Reviewed By,${csvEscape(report.proposal.reviewed_by_name)}`);
  lines.push(`Sector Lead Comment,${csvEscape(report.proposal.sector_lead_comment)}`);
  lines.push(`Report Generated At,${csvEscape(report.generated_at)}`);
  lines.push(`Generated By,${csvEscape(`${report.generated_by.name} (${report.generated_by.role})`)}`);

  lines.push('');
  lines.push('ACTIVITY UPDATES (date-wise)');
  lines.push(
    [
      'Activity Date',
      'Title',
      'Description',
      'Status',
      'Added By',
      'Added By Role',
      'Comments',
      'Approvals',
      'Poke Response',
      'Support File URL',
    ].join(',')
  );

  for (const activity of report.updates) {
    lines.push(
      [
        csvEscape(activity.activity_date),
        csvEscape(activity.title),
        csvEscape(activity.description),
        csvEscape(activity.status),
        csvEscape(activity.added_by_name),
        csvEscape(activity.added_by_role),
        csvEscape(formatCommentsForCsv(activity.comments)),
        csvEscape(formatApprovalsForCsv(activity.approvals)),
        csvEscape(formatPokeResponseForCsv(activity.poke_response)),
        csvEscape(activity.support_file_url),
      ].join(',')
    );
  }

  return lines.join('\r\n');
}

module.exports = {
  buildProposalReport,
  reportToCsv,
  formatCommentsForCsv,
  formatApprovalsForCsv,
  formatPokeResponseForCsv,
  getProposalForReport,
};

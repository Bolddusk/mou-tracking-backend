const pool = require('../config/db');

const ENGAGEMENT_TYPES = ['tag', 'poke', 'comment', 'poke_response'];

async function getProposalPartyB(proposalId) {
  const [rows] = await pool.query(
    'SELECT id, party_b_user_id, party_b_name, party_b_email FROM proposals WHERE id = ?',
    [proposalId]
  );
  return rows[0] || null;
}

async function getEngagementRows(complaintId) {
  const [rows] = await pool.query(
    `SELECT e.*, u.full_name AS author_name
     FROM complaint_party_b_engagements e
     JOIN users u ON u.id = e.author_id
     WHERE e.complaint_id = ?
     ORDER BY e.created_at ASC`,
    [complaintId]
  );
  return rows;
}

function formatEngagementItem(row) {
  const base = {
    id: row.id,
    type: row.type,
    author_id: row.author_id,
    author_name: row.author_name,
    author_role: row.author_role,
    comment: row.comment,
    document_url: row.document_url,
    created_at: row.created_at,
  };

  if (row.type === 'poke_response') {
    return {
      ...base,
      responds_to_id: row.responds_to_id,
      poke_response: {
        work_date: row.response_date
          ? new Date(row.response_date).toISOString().slice(0, 10)
          : row.response_date,
        title: row.response_title,
        description: row.response_description,
        document_url: row.response_document_url,
      },
    };
  }

  if (row.type === 'poke') {
    return {
      ...base,
      can_respond: !row._answered,
      is_answered: Boolean(row._answered),
    };
  }

  return base;
}

async function enrichEngagementList(rows) {
  const pokeIds = rows.filter((r) => r.type === 'poke').map((r) => r.id);
  const answeredPokeIds = new Set();

  if (pokeIds.length) {
    const [responses] = await pool.query(
      `SELECT responds_to_id FROM complaint_party_b_engagements
       WHERE complaint_id = ? AND type = 'poke_response' AND responds_to_id IN (?)`,
      [rows[0]?.complaint_id, pokeIds]
    );
    responses.forEach((r) => answeredPokeIds.add(r.responds_to_id));
  }

  return rows.map((row) => {
    if (row.type === 'poke') {
      row._answered = answeredPokeIds.has(row.id);
    }
    const formatted = formatEngagementItem(row);
    if (row.type === 'poke') {
      formatted.can_respond = !row._answered;
      formatted.is_answered = row._answered;
    }
    return formatted;
  });
}

async function getPendingPoke(complaintId) {
  const items = await getEngagementRows(complaintId);
  const pokes = items.filter((i) => i.type === 'poke');
  if (!pokes.length) return null;

  const [responses] = await pool.query(
    `SELECT responds_to_id FROM complaint_party_b_engagements
     WHERE complaint_id = ? AND type = 'poke_response'`,
    [complaintId]
  );
  const answeredIds = new Set(responses.map((r) => r.responds_to_id));

  for (let i = pokes.length - 1; i >= 0; i -= 1) {
    if (!answeredIds.has(pokes[i].id)) {
      return pokes[i];
    }
  }
  return null;
}

async function getPartyBDocumentsFromEngagement(complaintId) {
  const items = await getEngagementRows(complaintId);
  const docs = [];

  items
    .filter((item) => item.author_role === 'party_b')
    .forEach((item) => {
      if (item.document_url) {
        docs.push({
          source: item.type,
          author_name: item.author_name,
          author_role: item.author_role,
          document_url: item.document_url,
          comment: item.comment,
          created_at: item.created_at,
        });
      }
      if (item.type === 'poke_response' && item.response_document_url) {
        docs.push({
          source: 'poke_response',
          author_name: item.author_name,
          author_role: item.author_role,
          document_url: item.response_document_url,
          title: item.response_title,
          description: item.response_description,
          created_at: item.created_at,
        });
      }
    });

  return docs;
}

function canRfpEngagePartyB(complaint, userId) {
  return (
    complaint.status === 'forwarded' &&
    complaint.forwarded_to === userId &&
    complaint.party_b_tagged_at
  );
}

function canPartyBEngage(complaint, userId) {
  return (
    complaint.status === 'forwarded' &&
    complaint.party_b_user_id === userId &&
    complaint.party_b_tagged_at
  );
}

function canViewPartyBEngagement(req, complaint) {
  const { role, id: userId } = req.user;

  if (role === 'super_admin') return true;
  if (role === 'regional_focal_point' && complaint.forwarded_to === userId) return true;
  if (canPartyBEngage(complaint, userId)) return true;
  if (
    role === 'sector_lead' &&
    complaint.tagged_sector_lead === userId &&
    complaint.status === 'returned_to_sector_lead' &&
    complaint.party_b_tagged_at
  ) {
    return true;
  }
  return false;
}

module.exports = {
  ENGAGEMENT_TYPES,
  getProposalPartyB,
  getEngagementRows,
  enrichEngagementList,
  getPendingPoke,
  getPartyBDocumentsFromEngagement,
  canRfpEngagePartyB,
  canPartyBEngage,
  canViewPartyBEngagement,
};

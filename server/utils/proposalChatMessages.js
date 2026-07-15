const pool = require('../config/db');

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 200;
  const ALLOWED_SENDER_ROLES = new Set([
    'party_a',
    'party_b',
    'investor',
    'sector_lead',
    'super_admin',
    'admin',
  ]);

function formatChatMessage(row) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    text: row.message_text,
    sentAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function getProposalForChat(proposalId) {
  const [rows] = await pool.query(
    `SELECT id, party_a_id, party_b_user_id, status, sector, venture_name, proposal_title, company_name
     FROM proposals WHERE id = ?`,
    [proposalId]
  );
  return rows[0] || null;
}

function proposalTitle(proposal) {
  return proposal.venture_name || proposal.company_name || proposal.proposal_title || 'Proposal';
}

async function saveChatMessage({ proposalId, senderId, senderRole, text }) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('Message text is required');
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
  }
  if (!ALLOWED_SENDER_ROLES.has(senderRole)) {
    throw new Error('Invalid sender role for proposal chat');
  }

  const [result] = await pool.query(
    `INSERT INTO proposal_chat_messages (proposal_id, sender_id, sender_role, message_text)
     VALUES (?, ?, ?, ?)`,
    [proposalId, senderId, senderRole, trimmed]
  );

  const [rows] = await pool.query(
    `SELECT m.id, m.proposal_id, m.sender_id, m.sender_role, m.message_text, m.created_at,
            u.full_name AS sender_name
     FROM proposal_chat_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    [result.insertId]
  );

  return formatChatMessage(rows[0]);
}

async function getChatMessages(proposalId, { limit = DEFAULT_HISTORY_LIMIT, beforeId } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
  const params = [proposalId];
  let beforeClause = '';

  if (beforeId) {
    beforeClause = 'AND m.id < ?';
    params.push(Number(beforeId));
  }

  params.push(safeLimit);

  const [rows] = await pool.query(
    `SELECT m.id, m.proposal_id, m.sender_id, m.sender_role, m.message_text, m.created_at,
            u.full_name AS sender_name
     FROM proposal_chat_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.proposal_id = ? ${beforeClause}
     ORDER BY m.id DESC
     LIMIT ?`,
    params
  );

  return rows.reverse().map(formatChatMessage);
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  formatChatMessage,
  getProposalForChat,
  proposalTitle,
  saveChatMessage,
  getChatMessages,
};

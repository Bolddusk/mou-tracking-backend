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
  'power_admin',
]);

function formatChatMessage(row) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    conversationId: row.conversation_id ?? null,
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

/** Legacy helper — saves into General conversation when conversations migration is applied. */
async function saveChatMessage({ proposalId, senderId, senderRole, text, conversationId }) {
  const {
    ensureGroupConversation,
    saveConversationMessage,
  } = require('./proposalChatConversations');

  let convId = conversationId ? Number(conversationId) : null;
  if (!convId) {
    const group = await ensureGroupConversation(proposalId);
    convId = group.id;
  }

  return saveConversationMessage({
    proposalId,
    conversationId: convId,
    senderId,
    senderRole,
    text,
  });
}

/** Legacy helper — loads General conversation messages. */
async function getChatMessages(proposalId, { limit = DEFAULT_HISTORY_LIMIT, beforeId } = {}) {
  const {
    ensureGroupConversation,
    getConversationMessages,
  } = require('./proposalChatConversations');

  const group = await ensureGroupConversation(proposalId);
  return getConversationMessages(group.id, { limit, beforeId });
}

module.exports = {
  MAX_MESSAGE_LENGTH,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  ALLOWED_SENDER_ROLES,
  formatChatMessage,
  getProposalForChat,
  proposalTitle,
  saveChatMessage,
  getChatMessages,
};

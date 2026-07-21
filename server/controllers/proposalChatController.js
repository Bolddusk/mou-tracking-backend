const { checkApprovedPartyChatAccess } = require('../utils/proposalAccess');
const {
  getProposalForChat,
  getChatMessages,
  MAX_HISTORY_LIMIT,
} = require('../utils/proposalChatMessages');
const {
  listMouChatParticipants,
  ensureGroupConversation,
  getConversationById,
  checkConversationAccess,
  getOrCreateDirectConversation,
  getConversationMessages,
  markConversationRead,
  listConversationsForUser,
} = require('../utils/proposalChatConversations');

async function getProposalChatMessages(req, res) {
  try {
    const proposalId = Number(req.params.proposalId);
    if (!proposalId) {
      return res.status(400).json({ error: 'Invalid proposal id' });
    }

    const proposal = await getProposalForChat(proposalId);
    const access = await checkApprovedPartyChatAccess(req.user, proposal);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const limit = Math.min(Number(req.query.limit) || 100, MAX_HISTORY_LIMIT);
    const beforeId = req.query.before ? Number(req.query.before) : undefined;

    const group = await ensureGroupConversation(proposalId, proposal);
    const messages = await getChatMessages(proposalId, { limit, beforeId });

    return res.json({
      proposalId,
      conversationId: group.id,
      messages,
      hasMore: messages.length === limit,
      canSend: access.canSend !== false,
    });
  } catch (err) {
    console.error('Get chat messages error:', err.message);
    return res.status(500).json({ error: 'Failed to load chat messages' });
  }
}

async function listChatConversations(req, res) {
  try {
    const proposalId = Number(req.params.proposalId || req.params.id);
    if (!proposalId) {
      return res.status(400).json({ error: 'Invalid proposal id' });
    }

    const proposal = await getProposalForChat(proposalId);
    const access = await checkApprovedPartyChatAccess(req.user, proposal);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const conversations = await listConversationsForUser(proposal, req.user);
    return res.json({
      proposalId,
      conversations,
      canSend: access.canSend !== false,
    });
  } catch (err) {
    console.error('List chat conversations error:', err.message);
    return res.status(500).json({ error: 'Failed to load conversations' });
  }
}

async function listChatParticipants(req, res) {
  try {
    const proposalId = Number(req.params.proposalId || req.params.id);
    if (!proposalId) {
      return res.status(400).json({ error: 'Invalid proposal id' });
    }

    const proposal = await getProposalForChat(proposalId);
    const access = await checkApprovedPartyChatAccess(req.user, proposal);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const all = await listMouChatParticipants(proposal);
    // Start-chat picker: exclude self and RFP (RFP never in list anyway)
    const participants = all.filter(
      (u) =>
        u.id !== req.user.id &&
        !['regional_focal_point', 'focal_point'].includes(u.role)
    );

    return res.json({ proposalId, participants });
  } catch (err) {
    console.error('List chat participants error:', err.message);
    return res.status(500).json({ error: 'Failed to load participants' });
  }
}

async function createDirectConversation(req, res) {
  try {
    const proposalId = Number(req.params.proposalId || req.params.id);
    const peerUserId = Number(req.body.peer_user_id);
    if (!proposalId) {
      return res.status(400).json({ error: 'Invalid proposal id' });
    }
    if (!peerUserId) {
      return res.status(400).json({ error: 'peer_user_id is required' });
    }

    const proposal = await getProposalForChat(proposalId);
    const access = await checkApprovedPartyChatAccess(req.user, proposal);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }
    if (access.canSend === false) {
      return res.status(403).json({ error: 'Read-only users cannot start direct chats' });
    }

    const conversation = await getOrCreateDirectConversation(
      proposalId,
      req.user.id,
      peerUserId,
      proposal
    );

    const conversations = await listConversationsForUser(proposal, req.user);
    const item = conversations.find((c) => c.id === conversation.id);

    return res.status(201).json({
      proposalId,
      conversation: item || {
        id: conversation.id,
        proposalId,
        type: conversation.type,
      },
    });
  } catch (err) {
    console.error('Create direct conversation error:', err.message);
    return res.status(err.status || 500).json({
      error: err.status ? err.message : 'Failed to create conversation',
    });
  }
}

async function getConversationMessagesHandler(req, res) {
  try {
    const proposalId = Number(req.params.proposalId || req.params.id);
    const conversationId = Number(req.params.conversationId);
    if (!proposalId || !conversationId) {
      return res.status(400).json({ error: 'Invalid proposal or conversation id' });
    }

    const proposal = await getProposalForChat(proposalId);
    const access = await checkApprovedPartyChatAccess(req.user, proposal);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const conversation = await getConversationById(conversationId);
    const convAccess = await checkConversationAccess(req.user, proposal, conversation);
    if (!convAccess.ok) {
      return res.status(convAccess.status).json({ error: convAccess.error });
    }

    // RFP: group only, and still read-only send gated by proposal access
    if (
      ['regional_focal_point', 'focal_point'].includes(req.user.role) &&
      conversation.type !== 'group'
    ) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const limit = Math.min(Number(req.query.limit) || 100, MAX_HISTORY_LIMIT);
    const beforeId = req.query.before ? Number(req.query.before) : undefined;
    const messages = await getConversationMessages(conversationId, { limit, beforeId });

    return res.json({
      proposalId,
      conversationId,
      type: conversation.type,
      messages,
      hasMore: messages.length === limit,
      canSend: access.canSend !== false && convAccess.canSend !== false,
    });
  } catch (err) {
    console.error('Get conversation messages error:', err.message);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
}

async function markConversationReadHandler(req, res) {
  try {
    const proposalId = Number(req.params.proposalId || req.params.id);
    const conversationId = Number(req.params.conversationId);
    if (!proposalId || !conversationId) {
      return res.status(400).json({ error: 'Invalid proposal or conversation id' });
    }

    const proposal = await getProposalForChat(proposalId);
    const access = await checkApprovedPartyChatAccess(req.user, proposal);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const conversation = await getConversationById(conversationId);
    const convAccess = await checkConversationAccess(req.user, proposal, conversation);
    if (!convAccess.ok) {
      return res.status(convAccess.status).json({ error: convAccess.error });
    }

    const lastReadMessageId = req.body?.last_read_message_id
      ? Number(req.body.last_read_message_id)
      : null;

    const result = await markConversationRead(
      conversationId,
      req.user.id,
      lastReadMessageId
    );

    return res.json(result);
  } catch (err) {
    console.error('Mark conversation read error:', err.message);
    return res.status(500).json({ error: 'Failed to mark conversation read' });
  }
}

module.exports = {
  getProposalChatMessages,
  listChatConversations,
  listChatParticipants,
  createDirectConversation,
  getConversationMessagesHandler,
  markConversationReadHandler,
};

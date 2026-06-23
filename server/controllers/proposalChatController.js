const { checkApprovedPartyChatAccess } = require('../utils/proposalAccess');
const {
  getProposalForChat,
  getChatMessages,
  MAX_HISTORY_LIMIT,
} = require('../utils/proposalChatMessages');

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

    const messages = await getChatMessages(proposalId, { limit, beforeId });

    return res.json({
      proposalId,
      messages,
      hasMore: messages.length === limit,
      canSend: access.canSend !== false,
    });
  } catch (err) {
    console.error('Get chat messages error:', err.message);
    return res.status(500).json({ error: 'Failed to load chat messages' });
  }
}

module.exports = { getProposalChatMessages };

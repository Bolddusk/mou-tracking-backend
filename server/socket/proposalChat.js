const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { checkApprovedPartyChatAccess } = require('../utils/proposalAccess');
const {
  MAX_MESSAGE_LENGTH,
  getProposalForChat,
  proposalTitle,
} = require('../utils/proposalChatMessages');
const {
  ensureGroupConversation,
  getConversationById,
  checkConversationAccess,
  getConversationMessages,
  saveConversationMessage,
} = require('../utils/proposalChatConversations');

const CHAT_ROLES = new Set([
  'party_a',
  'party_b',
  'investor',
  'super_admin',
  'admin',
  'power_admin',
  'sector_lead',
  'regional_focal_point',
  'focal_point',
]);

function proposalRoom(proposalId) {
  return `proposal-chat:${proposalId}`;
}

function conversationRoom(conversationId) {
  return `chat-conv:${conversationId}`;
}

function inboxRoom(proposalId) {
  return `proposal-inbox:${proposalId}`;
}

function emitChatError(socket, code, message) {
  socket.emit('chat:error', { code, message });
}

function presencePayload(roomUsers) {
  return Array.from(roomUsers.values()).map((entry) => ({
    userId: entry.userId,
    fullName: entry.fullName,
    role: entry.role,
  }));
}

function initProposalChat(httpServer) {
  const clientOrigin = process.env.CLIENT_ORIGIN || '*';
  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      credentials: true,
    },
    path: '/socket.io',
  });

  const roomUsers = new Map();

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Unauthorized'));
    }

    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (!CHAT_ROLES.has(user.role)) {
        return next(new Error('Unauthorized role for proposal chat'));
      }
      socket.user = user;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const joinedRooms = new Set();

    socket.on('chat:join', async (payload = {}) => {
      try {
        const proposalId = Number(payload.proposalId);
        if (!proposalId) {
          return emitChatError(socket, 'INVALID_PROPOSAL', 'proposalId is required');
        }

        const proposal = await getProposalForChat(proposalId);
        const access = await checkApprovedPartyChatAccess(socket.user, proposal);
        if (access.error) {
          return emitChatError(socket, 'ACCESS_DENIED', access.error);
        }

        let conversation = null;
        const conversationId = payload.conversationId
          ? Number(payload.conversationId)
          : null;

        if (conversationId) {
          conversation = await getConversationById(conversationId);
          const convAccess = await checkConversationAccess(
            socket.user,
            proposal,
            conversation
          );
          if (!convAccess.ok) {
            return emitChatError(socket, 'ACCESS_DENIED', convAccess.error);
          }
          if (
            ['regional_focal_point', 'focal_point'].includes(socket.user.role) &&
            conversation.type !== 'group'
          ) {
            return emitChatError(socket, 'ACCESS_DENIED', 'Access denied to this conversation');
          }
        } else {
          conversation = await ensureGroupConversation(proposalId, proposal);
        }

        const convRoom = conversationRoom(conversation.id);
        const legacyRoom = proposalRoom(proposalId);
        const inbox = inboxRoom(proposalId);

        socket.join(convRoom);
        socket.join(inbox);
        joinedRooms.add(convRoom);
        joinedRooms.add(inbox);

        // Legacy FE: also join proposal room when opening General
        if (conversation.type === 'group') {
          socket.join(legacyRoom);
          joinedRooms.add(legacyRoom);
        }

        if (!roomUsers.has(convRoom)) {
          roomUsers.set(convRoom, new Map());
        }
        roomUsers.get(convRoom).set(socket.id, {
          userId: socket.user.id,
          fullName: socket.user.full_name,
          role: socket.user.role,
        });

        const messages = await getConversationMessages(conversation.id);

        socket.emit('chat:joined', {
          proposalId,
          conversationId: conversation.id,
          type: conversation.type,
          proposalTitle: proposalTitle(proposal),
          online: presencePayload(roomUsers.get(convRoom)),
          messages,
          canSend: access.canSend !== false,
          party_b_linked: Boolean(proposal.party_b_user_id),
        });

        socket.to(convRoom).emit('chat:presence', {
          proposalId,
          conversationId: conversation.id,
          online: presencePayload(roomUsers.get(convRoom)),
        });
      } catch (err) {
        console.error('chat:join error:', err.message);
        emitChatError(socket, 'JOIN_FAILED', 'Failed to join chat room');
      }
    });

    socket.on('chat:leave', (payload = {}) => {
      const proposalId = Number(payload.proposalId);
      const conversationId = payload.conversationId
        ? Number(payload.conversationId)
        : null;

      if (conversationId) {
        const convRoom = conversationRoom(conversationId);
        socket.leave(convRoom);
        joinedRooms.delete(convRoom);
        removeFromRoom(convRoom, socket.id);
        socket.to(convRoom).emit('chat:presence', {
          proposalId: proposalId || null,
          conversationId,
          online: presencePayload(roomUsers.get(convRoom) || new Map()),
        });
        return;
      }

      if (!proposalId) return;

      const room = proposalRoom(proposalId);
      socket.leave(room);
      joinedRooms.delete(room);
      removeFromRoom(room, socket.id);

      socket.to(room).emit('chat:presence', {
        proposalId,
        online: presencePayload(roomUsers.get(room) || new Map()),
      });
    });

    socket.on('chat:message', async (payload = {}) => {
      try {
        const proposalId = Number(payload.proposalId);
        const text = String(payload.text || '').trim();
        let conversationId = payload.conversationId
          ? Number(payload.conversationId)
          : null;

        if (!proposalId) {
          return emitChatError(socket, 'INVALID_PROPOSAL', 'proposalId is required');
        }
        if (!text) {
          return emitChatError(socket, 'EMPTY_MESSAGE', 'Message text is required');
        }
        if (text.length > MAX_MESSAGE_LENGTH) {
          return emitChatError(
            socket,
            'MESSAGE_TOO_LONG',
            `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`
          );
        }

        const proposal = await getProposalForChat(proposalId);
        const access = await checkApprovedPartyChatAccess(socket.user, proposal);
        if (access.error) {
          return emitChatError(socket, 'ACCESS_DENIED', access.error);
        }
        if (access.canSend === false) {
          return emitChatError(socket, 'READ_ONLY', 'You have read-only access to this chat');
        }

        let conversation;
        if (conversationId) {
          conversation = await getConversationById(conversationId);
        } else {
          conversation = await ensureGroupConversation(proposalId, proposal);
          conversationId = conversation.id;
        }

        const convAccess = await checkConversationAccess(
          socket.user,
          proposal,
          conversation
        );
        if (!convAccess.ok) {
          return emitChatError(socket, 'ACCESS_DENIED', convAccess.error);
        }
        if (
          ['regional_focal_point', 'focal_point'].includes(socket.user.role) &&
          conversation.type !== 'group'
        ) {
          return emitChatError(socket, 'ACCESS_DENIED', 'Access denied to this conversation');
        }

        const convRoom = conversationRoom(conversationId);
        const legacyRoom = proposalRoom(proposalId);
        // Must have joined this conversation (or legacy general room)
        const inConv = joinedRooms.has(convRoom);
        const inLegacyGeneral =
          conversation.type === 'group' && joinedRooms.has(legacyRoom);
        if (!inConv && !inLegacyGeneral) {
          return emitChatError(socket, 'NOT_IN_ROOM', 'Join the chat room before sending messages');
        }

        let message;
        try {
          message = await saveConversationMessage({
            proposalId,
            conversationId,
            senderId: socket.user.id,
            senderRole: socket.user.role,
            text,
          });
        } catch (saveErr) {
          if (saveErr.message.includes('characters or fewer')) {
            return emitChatError(socket, 'MESSAGE_TOO_LONG', saveErr.message);
          }
          throw saveErr;
        }

        // DM isolation: only conversation room. Group also mirrors to legacy room.
        io.to(convRoom).emit('chat:message', message);
        if (conversation.type === 'group') {
          io.to(legacyRoom).emit('chat:message', message);
        }

        io.to(inboxRoom(proposalId)).emit('chat:conversations_updated', {
          proposalId,
          conversationId,
          lastMessage: message,
        });
      } catch (err) {
        console.error('chat:message error:', err.message);
        emitChatError(socket, 'SEND_FAILED', 'Failed to send message');
      }
    });

    socket.on('chat:typing', (payload = {}) => {
      const proposalId = Number(payload.proposalId);
      const conversationId = payload.conversationId
        ? Number(payload.conversationId)
        : null;
      const isTyping = Boolean(payload.isTyping);

      if (conversationId) {
        const convRoom = conversationRoom(conversationId);
        if (!joinedRooms.has(convRoom)) return;
        socket.to(convRoom).emit('chat:typing', {
          proposalId: proposalId || null,
          conversationId,
          userId: socket.user.id,
          fullName: socket.user.full_name,
          role: socket.user.role,
          isTyping,
        });
        return;
      }

      if (!proposalId) return;
      const room = proposalRoom(proposalId);
      if (!joinedRooms.has(room)) return;

      socket.to(room).emit('chat:typing', {
        proposalId,
        userId: socket.user.id,
        fullName: socket.user.full_name,
        role: socket.user.role,
        isTyping,
      });
    });

    socket.on('disconnect', () => {
      for (const room of joinedRooms) {
        removeFromRoom(room, socket.id);
        if (room.startsWith('chat-conv:')) {
          const conversationId = Number(room.replace('chat-conv:', ''));
          io.to(room).emit('chat:presence', {
            conversationId,
            online: presencePayload(roomUsers.get(room) || new Map()),
          });
        } else if (room.startsWith('proposal-chat:')) {
          const proposalId = Number(room.replace('proposal-chat:', ''));
          io.to(room).emit('chat:presence', {
            proposalId,
            online: presencePayload(roomUsers.get(room) || new Map()),
          });
        }
      }
    });

    function removeFromRoom(room, socketId) {
      const users = roomUsers.get(room);
      if (!users) return;
      users.delete(socketId);
      if (users.size === 0) {
        roomUsers.delete(room);
      }
    }
  });

  console.log('Socket.io proposal chat ready (conversations + persisted messages)');
  return io;
}

module.exports = { initProposalChat, proposalRoom, conversationRoom };

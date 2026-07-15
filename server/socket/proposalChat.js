const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { checkApprovedPartyChatAccess } = require('../utils/proposalAccess');
const {
  MAX_MESSAGE_LENGTH,
  getProposalForChat,
  proposalTitle,
  saveChatMessage,
  getChatMessages,
} = require('../utils/proposalChatMessages');

const CHAT_ROLES = new Set([
  'party_a',
  'party_b',
  'investor',
  'super_admin',
  'sector_lead',
  'regional_focal_point',
  'focal_point',
]);

function proposalRoom(proposalId) {
  return `proposal-chat:${proposalId}`;
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

        const room = proposalRoom(proposalId);
        socket.join(room);
        joinedRooms.add(room);

        if (!roomUsers.has(room)) {
          roomUsers.set(room, new Map());
        }
        roomUsers.get(room).set(socket.id, {
          userId: socket.user.id,
          fullName: socket.user.full_name,
          role: socket.user.role,
        });

        const messages = await getChatMessages(proposalId);

        socket.emit('chat:joined', {
          proposalId,
          proposalTitle: proposalTitle(proposal),
          online: presencePayload(roomUsers.get(room)),
          messages,
          canSend: access.canSend !== false,
          party_b_linked: Boolean(proposal.party_b_user_id),
        });

        socket.to(room).emit('chat:presence', {
          proposalId,
          online: presencePayload(roomUsers.get(room)),
        });
      } catch (err) {
        console.error('chat:join error:', err.message);
        emitChatError(socket, 'JOIN_FAILED', 'Failed to join chat room');
      }
    });

    socket.on('chat:leave', (payload = {}) => {
      const proposalId = Number(payload.proposalId);
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

        const room = proposalRoom(proposalId);
        if (!joinedRooms.has(room)) {
          return emitChatError(socket, 'NOT_IN_ROOM', 'Join the chat room before sending messages');
        }

        const proposal = await getProposalForChat(proposalId);
        const access = await checkApprovedPartyChatAccess(socket.user, proposal);
        if (access.error) {
          return emitChatError(socket, 'ACCESS_DENIED', access.error);
        }
        if (access.canSend === false) {
          return emitChatError(socket, 'READ_ONLY', 'You have read-only access to this chat');
        }
        let message;
        try {
          message = await saveChatMessage({
            proposalId,
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

        io.to(room).emit('chat:message', message);
      } catch (err) {
        console.error('chat:message error:', err.message);
        emitChatError(socket, 'SEND_FAILED', 'Failed to send message');
      }
    });

    socket.on('chat:typing', (payload = {}) => {
      const proposalId = Number(payload.proposalId);
      const isTyping = Boolean(payload.isTyping);
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
        const proposalId = Number(room.replace('proposal-chat:', ''));
        io.to(room).emit('chat:presence', {
          proposalId,
          online: presencePayload(roomUsers.get(room) || new Map()),
        });
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

  console.log('Socket.io proposal chat ready (messages persisted to DB)');
  return io;
}

module.exports = { initProposalChat, proposalRoom };

const pool = require('../config/db');
const {
  formatChatMessage,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  MAX_MESSAGE_LENGTH,
  ALLOWED_SENDER_ROLES,
} = require('./proposalChatMessages');

function isStaffAdmin(user) {
  return user?.role === 'super_admin' || user?.role === 'admin';
}

function orderedPair(userIdA, userIdB) {
  const a = Number(userIdA);
  const b = Number(userIdB);
  return a < b ? [a, b] : [b, a];
}

function directPairKey(userIdA, userIdB) {
  const [low, high] = orderedPair(userIdA, userIdB);
  return `dm:${low}:${high}`;
}

async function listMouChatParticipants(proposal) {
  if (!proposal) return [];

  const byId = new Map();

  if (proposal.party_a_id) {
    const [rows] = await pool.query(
      `SELECT id, full_name, role, email FROM users WHERE id = ?`,
      [proposal.party_a_id]
    );
    if (rows[0]) byId.set(rows[0].id, rows[0]);
  }

  if (proposal.party_b_user_id) {
    const [rows] = await pool.query(
      `SELECT id, full_name, role, email FROM users WHERE id = ?`,
      [proposal.party_b_user_id]
    );
    if (rows[0]) byId.set(rows[0].id, rows[0]);
  }

  if (proposal.sector) {
    const [leads] = await pool.query(
      `SELECT DISTINCT u.id, u.full_name, u.role, u.email
       FROM users u
       LEFT JOIN sector_lead_assignments sla ON sla.user_id = u.id
       WHERE u.role = 'sector_lead'
         AND (sla.sector = ? OR u.sector = ?)
       ORDER BY u.full_name ASC`,
      [proposal.sector, proposal.sector]
    );
    for (const row of leads) byId.set(row.id, row);
  }

  const [admins] = await pool.query(
    `SELECT id, full_name, role, email
     FROM users
     WHERE role IN ('super_admin', 'admin', 'power_admin')
     ORDER BY full_name ASC`
  );
  for (const row of admins) byId.set(row.id, row);

  return Array.from(byId.values()).map((u) => ({
    id: u.id,
    full_name: u.full_name,
    role: u.role,
    email: u.email,
  }));
}

async function ensureGroupConversation(proposalId, proposal = null) {
  const [existing] = await pool.query(
    `SELECT * FROM proposal_chat_conversations
     WHERE proposal_id = ? AND type = 'group' AND pair_key = 'group'
     LIMIT 1`,
    [proposalId]
  );
  if (existing[0]) {
    await syncGroupParticipants(existing[0].id, proposalId, proposal);
    return existing[0];
  }

  const [ins] = await pool.query(
    `INSERT INTO proposal_chat_conversations
      (proposal_id, type, pair_key, user_low_id, user_high_id)
     VALUES (?, 'group', 'group', NULL, NULL)`,
    [proposalId]
  );

  const [rows] = await pool.query(`SELECT * FROM proposal_chat_conversations WHERE id = ?`, [
    ins.insertId,
  ]);
  await syncGroupParticipants(rows[0].id, proposalId, proposal);
  return rows[0];
}

async function syncGroupParticipants(conversationId, proposalId, proposal = null) {
  let p = proposal;
  if (!p) {
    const [rows] = await pool.query(
      `SELECT id, party_a_id, party_b_user_id, sector FROM proposals WHERE id = ?`,
      [proposalId]
    );
    p = rows[0];
  }
  if (!p) return;

  const participants = await listMouChatParticipants(p);
  for (const user of participants) {
    // Super admins are not required as group participants (role-based access),
    // but including them is fine for unread tracking when they send.
    if (user.role === 'super_admin' || user.role === 'admin') continue;
    await pool.query(
      `INSERT IGNORE INTO proposal_chat_participants (conversation_id, user_id)
       VALUES (?, ?)`,
      [conversationId, user.id]
    );
  }
}

async function getConversationById(conversationId) {
  const [rows] = await pool.query(`SELECT * FROM proposal_chat_conversations WHERE id = ?`, [
    conversationId,
  ]);
  return rows[0] || null;
}

async function isConversationParticipant(conversationId, userId) {
  const [rows] = await pool.query(
    `SELECT id FROM proposal_chat_participants
     WHERE conversation_id = ? AND user_id = ?
     LIMIT 1`,
    [conversationId, userId]
  );
  return Boolean(rows[0]);
}

async function checkConversationAccess(user, proposal, conversation) {
  if (!conversation) {
    return { ok: false, status: 404, error: 'Conversation not found' };
  }
  if (Number(conversation.proposal_id) !== Number(proposal.id)) {
    return { ok: false, status: 404, error: 'Conversation not found' };
  }

  if (isStaffAdmin(user)) {
    return { ok: true, canSend: true, isAdmin: true };
  }

  if (conversation.type === 'group') {
    // Same as proposal chat access (caller already checked proposal access)
    return { ok: true, canSend: true, isAdmin: false };
  }

  const member = await isConversationParticipant(conversation.id, user.id);
  if (!member) {
    return { ok: false, status: 403, error: 'Access denied to this conversation' };
  }
  return { ok: true, canSend: true, isAdmin: false };
}

async function getOrCreateDirectConversation(proposalId, userA, userB, proposal = null) {
  const a = Number(userA);
  const b = Number(userB);
  if (!a || !b || a === b) {
    const err = new Error('peer_user_id must be a different user on this MOU');
    err.status = 400;
    throw err;
  }

  let p = proposal;
  if (!p) {
    const [rows] = await pool.query(
      `SELECT id, party_a_id, party_b_user_id, sector, status FROM proposals WHERE id = ?`,
      [proposalId]
    );
    p = rows[0];
  }

  const participants = await listMouChatParticipants(p);
  const allowedIds = new Set(participants.map((u) => u.id));
  if (!allowedIds.has(a) || !allowedIds.has(b)) {
    const err = new Error('Both users must be participants on this MOU');
    err.status = 400;
    throw err;
  }

  const [low, high] = orderedPair(a, b);
  const pairKey = directPairKey(a, b);

  const [existing] = await pool.query(
    `SELECT * FROM proposal_chat_conversations
     WHERE proposal_id = ? AND pair_key = ?
     LIMIT 1`,
    [proposalId, pairKey]
  );
  if (existing[0]) return existing[0];

  const [ins] = await pool.query(
    `INSERT INTO proposal_chat_conversations
      (proposal_id, type, pair_key, user_low_id, user_high_id)
     VALUES (?, 'direct', ?, ?, ?)`,
    [proposalId, pairKey, low, high]
  );

  await pool.query(
    `INSERT INTO proposal_chat_participants (conversation_id, user_id)
     VALUES (?, ?), (?, ?)`,
    [ins.insertId, low, ins.insertId, high]
  );

  const [rows] = await pool.query(`SELECT * FROM proposal_chat_conversations WHERE id = ?`, [
    ins.insertId,
  ]);
  return rows[0];
}

async function getConversationMessages(conversationId, { limit = DEFAULT_HISTORY_LIMIT, beforeId } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
  const params = [conversationId];
  let beforeClause = '';

  if (beforeId) {
    beforeClause = 'AND m.id < ?';
    params.push(Number(beforeId));
  }
  params.push(safeLimit);

  const [rows] = await pool.query(
    `SELECT m.id, m.proposal_id, m.conversation_id, m.sender_id, m.sender_role, m.message_text, m.created_at,
            u.full_name AS sender_name
     FROM proposal_chat_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? ${beforeClause}
     ORDER BY m.id DESC
     LIMIT ?`,
    params
  );

  return rows.reverse().map((row) => ({
    ...formatChatMessage(row),
    conversationId: row.conversation_id,
  }));
}

async function saveConversationMessage({
  proposalId,
  conversationId,
  senderId,
  senderRole,
  text,
}) {
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
    `INSERT INTO proposal_chat_messages
      (proposal_id, conversation_id, sender_id, sender_role, message_text)
     VALUES (?, ?, ?, ?, ?)`,
    [proposalId, conversationId, senderId, senderRole, trimmed]
  );

  // Ensure sender is a participant (for unread tracking), including SA after first send
  await pool.query(
    `INSERT IGNORE INTO proposal_chat_participants (conversation_id, user_id)
     VALUES (?, ?)`,
    [conversationId, senderId]
  );

  // Auto-mark sender as having read their own message
  await pool.query(
    `UPDATE proposal_chat_participants
     SET last_read_message_id = ?
     WHERE conversation_id = ? AND user_id = ?`,
    [result.insertId, conversationId, senderId]
  );

  const [rows] = await pool.query(
    `SELECT m.id, m.proposal_id, m.conversation_id, m.sender_id, m.sender_role, m.message_text, m.created_at,
            u.full_name AS sender_name
     FROM proposal_chat_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    [result.insertId]
  );

  return {
    ...formatChatMessage(rows[0]),
    conversationId: rows[0].conversation_id,
  };
}

async function markConversationRead(conversationId, userId, lastReadMessageId = null) {
  let messageId = lastReadMessageId ? Number(lastReadMessageId) : null;
  if (!messageId) {
    const [latest] = await pool.query(
      `SELECT MAX(id) AS max_id FROM proposal_chat_messages WHERE conversation_id = ?`,
      [conversationId]
    );
    messageId = latest[0]?.max_id || null;
  }

  await pool.query(
    `INSERT INTO proposal_chat_participants (conversation_id, user_id, last_read_message_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id)`,
    [conversationId, userId, messageId]
  );

  return { conversationId, last_read_message_id: messageId };
}

async function getPeerUser(conversation, viewerId) {
  if (conversation.type !== 'direct') return null;
  const peerId =
    Number(conversation.user_low_id) === Number(viewerId)
      ? conversation.user_high_id
      : Number(conversation.user_high_id) === Number(viewerId)
        ? conversation.user_low_id
        : conversation.user_low_id; // SA viewing: show low as default peer label; enrich both below

  if (!peerId) return null;
  const [rows] = await pool.query(
    `SELECT id, full_name, role, email FROM users WHERE id = ?`,
    [peerId]
  );
  return rows[0]
    ? { id: rows[0].id, full_name: rows[0].full_name, role: rows[0].role, email: rows[0].email }
    : null;
}

async function enrichDirectForAdmin(conversation) {
  const ids = [conversation.user_low_id, conversation.user_high_id].filter(Boolean);
  if (!ids.length) return { peers: [] };
  const [rows] = await pool.query(
    `SELECT id, full_name, role, email FROM users WHERE id IN (?)`,
    [ids]
  );
  return {
    peers: rows.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      role: u.role,
      email: u.email,
    })),
  };
}

async function listConversationsForUser(proposal, user) {
  const group = await ensureGroupConversation(proposal.id, proposal);
  const isAdmin = isStaffAdmin(user);

  let directRows;
  if (isAdmin) {
    const [rows] = await pool.query(
      `SELECT * FROM proposal_chat_conversations
       WHERE proposal_id = ? AND type = 'direct'
       ORDER BY id DESC`,
      [proposal.id]
    );
    directRows = rows;
  } else {
    const [rows] = await pool.query(
      `SELECT c.*
       FROM proposal_chat_conversations c
       JOIN proposal_chat_participants p ON p.conversation_id = c.id
       WHERE c.proposal_id = ? AND c.type = 'direct' AND p.user_id = ?
       ORDER BY c.id DESC`,
      [proposal.id, user.id]
    );
    directRows = rows;
  }

  const conversations = [group, ...directRows];
  const result = [];

  for (const conv of conversations) {
    const [lastRows] = await pool.query(
      `SELECT m.id, m.proposal_id, m.conversation_id, m.sender_id, m.sender_role, m.message_text, m.created_at,
              u.full_name AS sender_name
       FROM proposal_chat_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ?
       ORDER BY m.id DESC
       LIMIT 1`,
      [conv.id]
    );
    const lastMessage = lastRows[0]
      ? { ...formatChatMessage(lastRows[0]), conversationId: lastRows[0].conversation_id }
      : null;

    const [partRows] = await pool.query(
      `SELECT last_read_message_id FROM proposal_chat_participants
       WHERE conversation_id = ? AND user_id = ?
       LIMIT 1`,
      [conv.id, user.id]
    );
    const lastRead = partRows[0]?.last_read_message_id || 0;

    const [unreadRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM proposal_chat_messages
       WHERE conversation_id = ? AND id > ? AND sender_id != ?`,
      [conv.id, lastRead, user.id]
    );

    let title = 'General';
    let peer = null;
    let peers = null;

    if (conv.type === 'direct') {
      if (isAdmin) {
        const enriched = await enrichDirectForAdmin(conv);
        peers = enriched.peers;
        title = peers.map((p) => p.full_name).join(' ↔ ') || 'Direct chat';
        peer =
          peers.find((p) => p.id !== user.id) || peers[0] || null;
      } else {
        peer = await getPeerUser(conv, user.id);
        title = peer?.full_name || 'Direct chat';
      }
    }

    result.push({
      id: conv.id,
      proposalId: conv.proposal_id,
      type: conv.type,
      title,
      peer,
      peers: conv.type === 'direct' && isAdmin ? peers : undefined,
      lastMessage,
      unreadCount: Number(unreadRows[0]?.cnt) || 0,
      updatedAt: lastMessage?.sentAt || (conv.created_at instanceof Date
        ? conv.created_at.toISOString()
        : conv.created_at),
    });
  }

  result.sort((a, b) => {
    if (a.type === 'group' && b.type !== 'group') return -1;
    if (b.type === 'group' && a.type !== 'group') return 1;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });

  return result;
}

module.exports = {
  isStaffAdmin,
  listMouChatParticipants,
  ensureGroupConversation,
  getConversationById,
  checkConversationAccess,
  getOrCreateDirectConversation,
  getConversationMessages,
  saveConversationMessage,
  markConversationRead,
  listConversationsForUser,
  directPairKey,
};

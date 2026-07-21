require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].cnt > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  if (!(await tableExists(connection, 'proposal_chat_messages'))) {
    console.error('proposal_chat_messages missing — run npm run db:migrate:proposal-chat first');
    process.exit(1);
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS proposal_chat_conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      proposal_id INT NOT NULL,
      type ENUM('group', 'direct') NOT NULL,
      pair_key VARCHAR(64) NOT NULL,
      user_low_id INT NULL,
      user_high_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
      FOREIGN KEY (user_low_id) REFERENCES users(id),
      FOREIGN KEY (user_high_id) REFERENCES users(id),
      UNIQUE KEY uq_proposal_chat_pair (proposal_id, pair_key),
      INDEX idx_proposal_chat_conv_proposal (proposal_id, type)
    )
  `);
  console.log('proposal_chat_conversations ready');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS proposal_chat_participants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      user_id INT NOT NULL,
      last_read_message_id INT NULL,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES proposal_chat_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE KEY uq_chat_participant (conversation_id, user_id),
      INDEX idx_chat_participant_user (user_id)
    )
  `);
  console.log('proposal_chat_participants ready');

  if (!(await columnExists(connection, 'proposal_chat_messages', 'conversation_id'))) {
    await connection.query(`
      ALTER TABLE proposal_chat_messages
      ADD COLUMN conversation_id INT NULL AFTER proposal_id,
      ADD INDEX idx_chat_msg_conversation (conversation_id, id),
      ADD CONSTRAINT fk_chat_msg_conversation
        FOREIGN KEY (conversation_id) REFERENCES proposal_chat_conversations(id) ON DELETE SET NULL
    `);
    console.log('Added proposal_chat_messages.conversation_id');
  }

  await connection.query(`
    ALTER TABLE proposal_chat_messages
    MODIFY sender_role ENUM(
      'party_a', 'party_b', 'investor', 'sector_lead', 'super_admin', 'admin'
    ) NOT NULL
  `);
  console.log('Widened proposal_chat_messages.sender_role');

  // Ensure a General conversation for every proposal that has messages or is approved
  const [proposals] = await connection.query(`
    SELECT DISTINCT p.id, p.party_a_id, p.party_b_user_id, p.sector
    FROM proposals p
    WHERE p.status = 'approved'
       OR EXISTS (SELECT 1 FROM proposal_chat_messages m WHERE m.proposal_id = p.id)
  `);

  for (const p of proposals) {
    const [existing] = await connection.query(
      `SELECT id FROM proposal_chat_conversations
       WHERE proposal_id = ? AND type = 'group' AND pair_key = 'group'
       LIMIT 1`,
      [p.id]
    );

    let conversationId = existing[0]?.id;
    if (!conversationId) {
      const [ins] = await connection.query(
        `INSERT INTO proposal_chat_conversations
          (proposal_id, type, pair_key, user_low_id, user_high_id)
         VALUES (?, 'group', 'group', NULL, NULL)`,
        [p.id]
      );
      conversationId = ins.insertId;
    }

    await connection.query(
      `UPDATE proposal_chat_messages
       SET conversation_id = ?
       WHERE proposal_id = ? AND conversation_id IS NULL`,
      [conversationId, p.id]
    );

    const participantIds = new Set();
    if (p.party_a_id) participantIds.add(p.party_a_id);
    if (p.party_b_user_id) participantIds.add(p.party_b_user_id);

    if (p.sector) {
      const [leads] = await connection.query(
        `SELECT DISTINCT u.id
         FROM users u
         LEFT JOIN sector_lead_assignments sla ON sla.user_id = u.id
         WHERE u.role = 'sector_lead'
           AND (sla.sector = ? OR u.sector = ?)`,
        [p.sector, p.sector]
      );
      for (const row of leads) participantIds.add(row.id);
    }

    const [senders] = await connection.query(
      `SELECT DISTINCT sender_id FROM proposal_chat_messages WHERE proposal_id = ?`,
      [p.id]
    );
    for (const row of senders) participantIds.add(row.sender_id);

    for (const userId of participantIds) {
      if (!userId) continue;
      await connection.query(
        `INSERT IGNORE INTO proposal_chat_participants (conversation_id, user_id)
         VALUES (?, ?)`,
        [conversationId, userId]
      );
    }
  }

  console.log(`Backfilled group conversations for ${proposals.length} proposal(s)`);
  await connection.end();
  console.log('Proposal chat conversations migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

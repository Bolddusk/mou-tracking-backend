require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

const MM_TABLES = ['mm_matches', 'mm_china_proposals', 'mm_pakistan_proposals'];

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function rollback() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  console.log('Rolling back matchmaking pipeline migration...');

  if (await tableExists(connection, 'mm_matches')) {
    const [engagementRows] = await connection.query(
      `SELECT engagement_proposal_id FROM mm_matches WHERE engagement_proposal_id IS NOT NULL`
    );
    const engagementIds = engagementRows
      .map((r) => r.engagement_proposal_id)
      .filter(Boolean);

    if (engagementIds.length > 0) {
      await connection.query(
        `DELETE FROM proposal_chat_messages WHERE proposal_id IN (?)`,
        [engagementIds]
      );
      await connection.query(
        `DELETE FROM proposal_activities WHERE proposal_id IN (?)`,
        [engagementIds]
      );
      await connection.query(`DELETE FROM proposals WHERE id IN (?)`, [engagementIds]);
      console.log(`Removed ${engagementIds.length} bridged engagement proposal(s)`);
    }
  }

  for (const table of MM_TABLES) {
    if (await tableExists(connection, table)) {
      await connection.query(`DROP TABLE ${table}`);
      console.log(`Dropped ${table}`);
    }
  }

  await connection.end();
  console.log('Matchmaking rollback complete.');
}

rollback().catch((err) => {
  console.error('Rollback failed:', err.message);
  process.exit(1);
});

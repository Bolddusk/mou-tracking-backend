require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mysql = require('mysql2/promise');
const { getDbConfig } = require('../config/db');

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function addExemptColumn(connection, table) {
  if (!(await columnExists(connection, table, 'mou_ack_exempt'))) {
    await connection.query(
      `ALTER TABLE ${table} ADD COLUMN mou_ack_exempt TINYINT(1) NOT NULL DEFAULT 0`
    );
    console.log(`Added ${table}.mou_ack_exempt`);
  }
}

async function backfillHistoricProposals(connection) {
  const [result] = await connection.query(`
    UPDATE proposals
    SET
      mou_ack_exempt = 1,
      mou_ack_by_a = 1,
      mou_ack_by_a_at = COALESCE(mou_ack_by_a_at, NOW()),
      mou_ack_by_b = 1,
      mou_ack_by_b_at = COALESCE(mou_ack_by_b_at, NOW())
    WHERE mou_ack_exempt = 0
      AND (
        (mou_file_url IS NOT NULL AND mou_file_url != '')
        OR mou_status IN ('uploaded', 'signed', 'deal_closed')
      )
  `);
  console.log(`Marked ${result.affectedRows} historic proposal(s) as acknowledgment-exempt`);
}

async function backfillHistoricMatches(connection) {
  const [engagementRows] = await connection.query(`
    SELECT m.id
    FROM mm_matches m
    JOIN proposals p ON p.id = m.engagement_proposal_id
    WHERE m.mou_ack_exempt = 0
      AND (
        (p.mou_file_url IS NOT NULL AND p.mou_file_url != '')
        OR m.mou_status IN ('uploaded', 'signed', 'deal_closed')
      )
  `);

  if (!engagementRows.length) {
    console.log('Marked 0 historic matchmaking match(es) as acknowledgment-exempt');
    return;
  }

  const ids = engagementRows.map((row) => row.id);
  const [result] = await connection.query(
    `UPDATE mm_matches
     SET
       mou_ack_exempt = 1,
       mou_ack_by_a = 1,
       mou_ack_by_a_at = COALESCE(mou_ack_by_a_at, NOW()),
       mou_ack_by_b = 1,
       mou_ack_by_b_at = COALESCE(mou_ack_by_b_at, NOW())
     WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  console.log(`Marked ${result.affectedRows} historic matchmaking match(es) as acknowledgment-exempt`);
}

async function migrate() {
  const config = getDbConfig();
  const { database, ...serverConfig } = config;
  const connection = await mysql.createConnection({ ...serverConfig, database });

  await addExemptColumn(connection, 'proposals');
  await addExemptColumn(connection, 'mm_matches');
  await backfillHistoricProposals(connection);
  await backfillHistoricMatches(connection);

  await connection.end();
  console.log('Historic MOU acknowledgment exemption migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

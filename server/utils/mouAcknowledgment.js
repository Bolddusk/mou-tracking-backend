function formatMouAckStatus(row, mouFileUrl) {
  return {
    mou_status: row.mou_status || 'not_started',
    mou_file_url: mouFileUrl || row.mou_file_url || null,
    mou_uploaded_by: row.mou_uploaded_by ?? null,
    mou_uploaded_at: row.mou_uploaded_at ?? null,
    party_a_acknowledged: Boolean(row.mou_ack_by_a),
    party_a_ack_at: row.mou_ack_by_a_at ?? null,
    party_b_acknowledged: Boolean(row.mou_ack_by_b),
    party_b_ack_at: row.mou_ack_by_b_at ?? null,
    deal_closed_at: row.deal_closed_at ?? null,
    deal_closed_by: row.deal_closed_by ?? null,
    deal_closed_by_name: row.deal_closed_by_name ?? null,
  };
}

function resolveSignedStatus(ackByA, ackByB, currentStatus) {
  if (ackByA && ackByB) return 'signed';
  return currentStatus;
}

module.exports = { formatMouAckStatus, resolveSignedStatus };

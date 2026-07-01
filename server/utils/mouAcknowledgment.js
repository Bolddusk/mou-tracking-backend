function isMouAckExempt(row) {
  if (!row) return false;
  return Boolean(row.mou_ack_exempt);
}

function formatMouAckStatus(row, mouFileUrl) {
  const exempt = isMouAckExempt(row);
  const fileUrl = mouFileUrl || row.mou_file_url || null;
  const hasFile = Boolean(fileUrl);

  return {
    mou_status: row.mou_status || 'not_started',
    mou_file_url: fileUrl,
    mou_uploaded_by: row.mou_uploaded_by ?? null,
    mou_uploaded_at: row.mou_uploaded_at ?? null,
    party_a_acknowledged: exempt ? true : Boolean(row.mou_ack_by_a),
    party_a_ack_at: exempt ? row.mou_ack_by_a_at ?? null : row.mou_ack_by_a_at ?? null,
    party_b_acknowledged: exempt ? true : Boolean(row.mou_ack_by_b),
    party_b_ack_at: exempt ? row.mou_ack_by_b_at ?? null : row.mou_ack_by_b_at ?? null,
    deal_closed_at: row.deal_closed_at ?? null,
    deal_closed_by: row.deal_closed_by ?? null,
    deal_closed_by_name: row.deal_closed_by_name ?? null,
    acknowledgment_required: !exempt,
    is_historic_mou: exempt,
    can_acknowledge: !exempt && hasFile,
  };
}

function resolveSignedStatus(ackByA, ackByB, currentStatus) {
  if (ackByA && ackByB) return 'signed';
  return currentStatus;
}

module.exports = { isMouAckExempt, formatMouAckStatus, resolveSignedStatus };

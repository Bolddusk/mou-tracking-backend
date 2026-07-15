# MOU Delete + Progress Read-Only (Edit MOU) — Frontend

Backend now supports:

1. **Delete MOU file** on MOU tab
2. **Progress blocked** from Edit MOU fields (update only via Progress tab)

---

## 1. Capabilities (dynamic — use these, don’t hardcode)

`GET /api/proposals/:id` and `GET /api/proposals/:id/mou`:

```json
{
  "capabilities": {
    "can_view_mou": true,
    "can_upload_mou": true,
    "can_delete_mou": true,
    "can_edit_mou_fields": false
  }
}
```

| Flag | When true |
|------|-----------|
| `can_upload_mou` | Show Replace / Upload file |
| `can_delete_mou` | Show **Delete** — only when a file exists **and** user can upload |
| `can_edit_mou_fields` | Edit scope/description/demand (false for Sector Lead) |

---

## 2. Delete MOU file

```
DELETE /api/proposals/:id/mou
Authorization: Bearer <token>
```

**Roles:** same as upload — `super_admin`, `admin`, `sector_lead` (with upload permission), Party A/B on their MOU.

### Success `200`

```json
{
  "message": "MOU file deleted successfully",
  "proposal_id": 420,
  "mou_status": "in_progress",
  "mou": {
    "mou_scope": "...",
    "mou_description": "...",
    "mou_file_url": null
  },
  "capabilities": {
    "can_upload_mou": true,
    "can_delete_mou": false,
    "can_edit_mou_fields": true
  }
}
```

### Errors

| Status | Meaning |
|--------|---------|
| `400` | No file to delete, or deal closed / locked |
| `403` | No permission |
| `404` | Proposal not found |

### Frontend UX

```tsx
const { can_upload_mou, can_delete_mou } = proposal.capabilities;

{proposal.mou_file_url && can_delete_mou && (
  <button
    onClick={async () => {
      if (!confirm('Delete this MOU document? Parties will need to re-upload and re-acknowledge.')) return;
      await api.delete(`/api/proposals/${id}/mou`);
      // refetch proposal detail
    }}
  >
    Delete MOU
  </button>
)}
```

**Note:** Version history (`GET .../mou/versions`) is **kept** — delete only clears the current `mou_file_url`. Acknowledgments reset.

---

## 3. Progress — Edit MOU fields (read-only)

### Frontend

- Edit MOU modal: **Progress** = display only (no input)
- Do **not** send `executive_summary.progress` in `PATCH /api/proposals/:id/fields`
- Updates only from **Progress tab** (`POST/PATCH` activities)

### Backend enforcement

`PATCH /api/proposals/:id/fields` **ignores** `executive_summary.progress` even if the client sends it.

Catalog:

```
GET /api/proposals/:id/editable-fields
→ catalog.read_only_executive_summary_keys: ["progress"]
```

Use that list so Progress stays out of the edit form dynamically.

---

## 4. Temporary dashboard button

`POST /api/admin/update-requests/dismiss-all-pending` still exists for admin tooling.

**UI:** Remove the yellow “Clear all pending update requests” bar from All Opportunities — not needed as a permanent control.

---

## 5. Suggested MOU tab layout (less confusion)

One flow top → bottom:

1. **Workflow status** (lifecycle badge / ack)
2. **Document card** — Preview · Download · Upload/Replace · **Delete** (if `can_delete_mou`)
3. **Version history** (once, collapsible)
4. **MOU text fields** (scope/description — SL read-only)

Avoid duplicate Preview/Download/Version History blocks.

---

## Checklist

- [ ] Show Delete when `capabilities.can_delete_mou`
- [ ] Confirm modal before delete
- [ ] Refetch detail after delete
- [ ] Progress read-only in Edit MOU; update via Progress tab only
- [ ] Prefer `catalog.read_only_executive_summary_keys` from API
- [ ] Remove temporary dismiss-all dashboard button

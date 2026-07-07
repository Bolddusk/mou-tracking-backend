# MOU Tab — Sector Lead restrictions (Frontend)

## Rule

| Role | Scope / Sector / Description / Demand | MOU file upload | Preview |
|------|--------------------------------------|-----------------|---------|
| **Sector Lead** | ❌ Read-only | ✅ | ✅ |
| **Super Admin / Admin** | ✅ Edit all | ✅ | ✅ |
| **Party A / Party B** | ✅ (owner) | ✅ | ✅ |

Sector Lead **sirf MOU document upload** kar sakta hai — text fields change nahi.

---

## API capabilities

`GET /api/proposals/:id` → `capabilities`:

```json
{
  "can_view_mou": true,
  "can_upload_mou": true,
  "can_edit_mou_fields": false
}
```

`GET /api/proposals/:id/mou` → same flags in response:

```json
{
  "proposal_id": 278,
  "mou": { "mou_scope": "...", "mou_description": "..." },
  "capabilities": {
    "can_view_mou": true,
    "can_upload_mou": true,
    "can_edit_mou_fields": false
  }
}
```

| Flag | SL | SA / Admin |
|------|-----|------------|
| `can_view_mou` | ✅ | ✅ |
| `can_upload_mou` | ✅ | ✅ |
| `can_edit_mou_fields` | ❌ | ✅ |

---

## Frontend UI

```javascript
const { can_upload_mou, can_edit_mou_fields } = capabilities;

// Text fields — disabled for SL
<input disabled={!can_edit_mou_fields} ... />  // scope, sector, description, demand
<textarea disabled={!can_edit_mou_fields} ... />

// File upload — SL + SA
{can_upload_mou && <input type="file" name="mou_file" />}

// Signed checkbox — only SA/Admin (same as text fields)
<input type="checkbox" disabled={!can_edit_mou_fields} ... />

// Save button — show when can_upload_mou (SL saves file only)
{can_upload_mou && <button type="submit">Save MOU</button>}
```

**SL save:** sirf `mou_file` bhejo — body mein `mou_scope`, `mou_description`, etc. mat bhejo.

---

## Backend enforcement

`PATCH /api/proposals/:id/mou` — agar SL text fields ya `mou_status` bheje (file ke baghair):

```json
{
  "error": "Sector Lead can only upload MOU document here — scope, sector, description, and demand cannot be changed"
}
```

HTTP **403**

---

## Edit MOU fields (Details tab)

Scope/sector/description type fields **Details tab** se Super Admin / Admin `PATCH /api/proposals/:id/fields` se change karte hain — woh alag flow hai (`MOU_FULL_FIELD_EDIT_FRONTEND.md`).

SL ko wahan bhi sector change allowed nahi (pehle se).

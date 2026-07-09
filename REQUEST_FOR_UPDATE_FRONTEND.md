# Request for Update — Frontend Integration

**Replaces:** open-ended poke with no Party A email check and no Sector Lead review step.

---

## One-time migration (server)

```bash
npm run db:migrate:poke-workflow
```

Adds dismiss/promote columns on `proposal_activities`.

---

## Flow summary

```
Sector Lead / Super Admin
  → Request for Update (only if Party A email exists)
      ↓
Party A
  → Submit update (work date, title, what was done, proof)
      ↓
Sector Lead / Super Admin
  → Review → optional Edit → Move to Progress
      ↓
Progress tab
  → New manual progress row + MOU Details Progress field updated
```

**Super Admin temporary cleanup (live):** clear all pending requests in one click — remove this button after cleanup.

---

## Status values (`poke_status.status` / `capabilities.update_request_status`)

| Status | Meaning | List column |
|--------|---------|-------------|
| `none` | No active request | `—` |
| `pending_response` | Waiting for Party A | `Update requested by Sector Lead · Pending` |
| `awaiting_review` | Party A submitted — SL must review | `Update requested by Sector Lead · Ready for review` |

After promote or dismiss → back to `none`.

---

## Capabilities (`GET /api/proposals/:id`)

Merged into `capabilities`:

```json
{
  "party_a_has_email": true,
  "update_request_status": "pending_response",
  "can_request_update": false,
  "can_respond_to_update_request": false,
  "can_edit_update_response": false,
  "can_promote_update_to_progress": false,
  "can_dismiss_update_request": false,
  "can_dismiss_all_pending_update_requests": true
}
```

| Flag | Who | When |
|------|-----|------|
| `can_request_update` | SL / SA / Admin | Approved MOU, Party A email set, no open request |
| `can_respond_to_update_request` | Party A | `pending_response` |
| `can_edit_update_response` | SL / SA / Admin | `awaiting_review` |
| `can_promote_update_to_progress` | SL / SA / Admin | `awaiting_review` |
| `can_dismiss_update_request` | Super Admin only | Open request on this MOU |
| `can_dismiss_all_pending_update_requests` | Super Admin only | Always `true` for SA (global cleanup) |

**UI — Request for Update button:**

```javascript
const showRequestBtn = proposal.capabilities?.can_request_update;
```

If `party_a_has_email === false`, disable button + tooltip:

> Put email for Party A in Companies tab before requesting an update.

Use `capabilities.request_update_hint` for the exact message.

---

## 1. Sector Lead — Request for Update

```
POST /api/proposals/:proposalId/poke
Authorization: Bearer <token>
```

**No body.**

**Success `201`:**

```json
{
  "id": 45,
  "title": "Update Requested",
  "is_poke": true,
  "poke_workflow_status": "pending_response",
  "poke_status": {
    "status": "pending_response",
    "poke_activity_id": 45,
    "short_label": "Update requested by Sector Lead · Pending"
  },
  "update_request": { "can_request_update": false, "update_request_status": "pending_response" }
}
```

**Errors:**

| Code | error |
|------|-------|
| 400 | `Put email for Party A in Companies tab before requesting an update` |
| 400 | `An update request is already pending — waiting for Party A response` |
| 400 | `Party A already submitted an update — review or promote it before sending a new request` |

**Party A email source:** `party_a_info.email` on MOU **Companies tab → Edit contacts** only. Login/user account email does **not** count.

---

## 2. Party A — Submit update

```
POST /api/activities/:pokeActivityId/respond
```

Use `proposal.poke_status.poke_activity_id` as `:pokeActivityId`.

**Body:**

```json
{
  "activity_date": "2026-07-09",
  "title": "Site visit completed",
  "description": "What was done on site",
  "what_was_done": "What was done on site",
  "support_file_url": "https://mou-api.example.com/uploads/proof.pdf",
  "comment": "Optional note"
}
```

| Modal field | API field |
|-------------|-----------|
| Work Date | `activity_date` or `work_date` |
| Title | `title` |
| What was done? | `description` or `what_was_done` (**required**) |
| Proof file | `support_file_url` |

**After success:** `poke_status.status` → `awaiting_review`

**Party A UI:** show banner when `capabilities.can_respond_to_update_request === true`.

---

## 3. Sector Lead — Review Party A update

### Read response

From `GET /api/proposals/:id`:

```json
{
  "poke_status": {
    "status": "awaiting_review",
    "poke_activity_id": 45,
    "party_a_response": {
      "work_date": "2026-07-09",
      "title": "Site visit completed",
      "description": "What was done on site",
      "support_file_url": "...",
      "submitted_at": "2026-07-09T...",
      "submitted_by_name": "Ali Khan"
    },
    "short_label": "Update requested by Sector Lead · Ready for review"
  }
}
```

### Edit response (before promoting)

```
PATCH /api/activities/:pokeActivityId/poke-response
```

**Body (any of):**

```json
{
  "activity_date": "2026-07-09",
  "title": "Edited title",
  "description": "Edited what was done",
  "support_file_url": "..."
}
```

**Roles:** `sector_lead`, `super_admin`, `admin`

### Move to Progress (approve)

```
POST /api/activities/:pokeActivityId/promote-to-progress
```

**Optional body:**

```json
{ "comment": "Verified and recorded" }
```

**Success `201`:**

```json
{
  "message": "Party A update moved to Progress",
  "progress_entry": { "id": 50, "description": "...", "recorded_at": "9 Jul 2026, 11:30 am" },
  "poke_status": { "status": "none" },
  "update_request": { "update_request_status": "none", "can_request_update": true }
}
```

Creates a **manual** progress row and updates **MOU Details → Progress** with timestamp.

**UI buttons when `can_promote_update_to_progress`:**

- **Edit update** → PATCH `poke-response`
- **Add to Progress** → POST `promote-to-progress`

---

## 4. Super Admin — Clear all pending (temporary)

**Dashboard / Opportunities tab** — one button (SA only):

```
POST /api/admin/update-requests/dismiss-all-pending
Authorization: Bearer <super_admin_token>
```

**Response:**

```json
{
  "message": "All pending update requests cleared",
  "dismissed_count": 42
}
```

Only clears requests **waiting for Party A** (`pending_response`).  
Does **not** dismiss `awaiting_review` (Party A already submitted).

**Per-MOU dismiss (SA only):**

```
POST /api/activities/:pokeActivityId/dismiss-update-request
```

---

## List table column — Request for Update

Use `proposal.poke_status.short_label`:

| short_label | Badge colour |
|-------------|--------------|
| `—` | hidden / grey |
| `... · Pending` | amber |
| `... · Ready for review` | blue |

After deploy + SA bulk dismiss, pending rows on live should clear.

---

## Button visibility cheat sheet

| Button | Show when |
|--------|-----------|
| **Request for Update** | `capabilities.can_request_update` |
| **Respond (Party A)** | `capabilities.can_respond_to_update_request` |
| **Edit update** | `capabilities.can_edit_update_response` |
| **Add to Progress** | `capabilities.can_promote_update_to_progress` |
| **Clear all pending requests** (SA, temporary) | `capabilities.can_dismiss_all_pending_update_requests` |

---

## Refetch after actions

| Action | Refetch |
|--------|---------|
| Request for Update | `GET /api/proposals/:id` + list |
| Party A respond | proposal detail |
| Edit / Promote | proposal detail + `GET /api/proposals/:id/activities` |
| SA dismiss all | opportunities list |

---

## Related docs

- `STEP3_POKE_LINKED_RESPONSE_API.md` — Party A respond field details
- `PROGRESS_TAB_FRONTEND.md` — Progress tab after promote
- `PROPOSAL_PARTY_CONTACTS_FRONTEND.md` — Party A email on Companies tab

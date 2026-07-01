# Historic MOU Acknowledgment + Super Admin Filtering — Frontend Integration

**Backend base URL:** your API host (e.g. `https://api.malgary.com` or `http://localhost:5000`)  
**Auth:** `Authorization: Bearer <token>`  
**Role:** Super Admin for list/filter APIs; MOU status APIs vary by role (see below)

---

## 1. One-time setup (run on server — you run this yourself)

After deploying the updated backend:

```bash
cd /path/to/investment-portal-backend
npm run db:migrate:historic-mou-ack-exempt
```

This migration:

- Adds `mou_ack_exempt` column to `proposals` and `mm_matches`
- Marks **existing historic MOUs** (already have MOU file or MOU status uploaded/signed/deal_closed) as exempt
- Auto-marks both parties as acknowledged for those records

**New MOUs created after this migration** still use normal acknowledgment (unless they match historic criteria at migration time only — new records start with `mou_ack_exempt = 0`).

---

## 2. Historic MOU — remove acknowledgment UI

### What changed

MOU status API now returns three new fields:

| Field | Type | Meaning |
|-------|------|---------|
| `acknowledgment_required` | boolean | `false` = hide entire acknowledgment section |
| `is_historic_mou` | boolean | `true` = legacy/historic record |
| `can_acknowledge` | boolean | `false` = do not show "I Acknowledge" button |

When `acknowledgment_required === false`:

- **Hide** "Party Acknowledgments" block entirely
- **Hide** progress bar (1/2 parties)
- **Hide** acknowledge buttons for Party A and Party B
- Show MOU lifecycle from `mou_status` only (Uploaded → Signed → Deal Closed)

When `acknowledgment_required === true` (new MOUs):

- Keep existing Step 17 UI unchanged

### Direct MOUS — get status

```
GET /api/proposals/:id/mou/status
```

**Roles:** `party_a`, `party_b`, `investor`, `sector_lead`, `super_admin`

**Example response (historic MOU):**

```json
{
  "proposal_id": 1,
  "match_id": null,
  "mou_status": "uploaded",
  "mou_file_url": "https://.../mou.pdf",
  "party_a_acknowledged": true,
  "party_b_acknowledged": true,
  "acknowledgment_required": false,
  "is_historic_mou": true,
  "can_acknowledge": false,
  "current_version": 1,
  "total_versions": 1,
  "versions": []
}
```

**Example response (new MOU — ack still required):**

```json
{
  "proposal_id": 99,
  "mou_status": "uploaded",
  "party_a_acknowledged": false,
  "party_b_acknowledged": false,
  "acknowledgment_required": true,
  "is_historic_mou": false,
  "can_acknowledge": true
}
```

### Matchmaking — get status

```
GET /api/matchmaking/matches/:matchId/mou/status
```

Same new fields in response.

### Acknowledge endpoint (blocked for historic)

```
PATCH /api/proposals/:id/mou/acknowledge
PATCH /api/matchmaking/matches/:matchId/mou/acknowledge
```

**Historic MOU response `400`:**

```json
{
  "error": "Acknowledgment is not required for historic MOU records"
}
```

Frontend should not call this when `can_acknowledge === false`.

---

## 3. Frontend UI rules (MOU tab)

```tsx
// Pseudocode
const status = await fetchMouStatus(proposalId);

if (!status.acknowledgment_required) {
  // Do NOT render Party Acknowledgments section
} else {
  // Render existing acknowledgment UI
  // Show button only if can_acknowledge && current user is party A or B && their side not ack'd
}
```

**Optional badge for historic records:**

```tsx
{status.is_historic_mou && (
  <span className="badge">Historic MOU — acknowledgment not required</span>
)}
```

---

## 4. Super Admin — filtering (All Opportunities)

### Get filter dropdown options

```
GET /api/proposals/filter-options
```

**Role:** `super_admin` only

**Response `200`:**

```json
{
  "proposal_statuses": ["draft", "submitted", "approved", "rejected", "resubmitted", "completed"],
  "mou_statuses": ["not_started", "in_progress", "uploaded", "signed", "deal_closed"],
  "sectors": [
    "Agri-chemicals & Inputs",
    "Agri Technology & Precision Agriculture Solutions",
    "..."
  ]
}
```

Call once on dashboard mount to populate dropdowns.

---

### List proposals with filters

```
GET /api/proposals/all
```

**Role:** `super_admin` only

**Query parameters (all optional, combinable):**

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `status` | string | `approved` | Proposal workflow status |
| `sector` | string | `Agri-chemicals & Inputs` | Exact sector match |
| `mou_status` | string | `uploaded` | Resolved MOU lifecycle status |
| `q` | string | `Khan` | Search title, party names, org, sector |
| `date_from` | date | `2024-01-01` | Created on or after (YYYY-MM-DD) |
| `date_to` | date | `2024-12-31` | Created on or before |
| `has_mou` | boolean | `true` | MOU file uploaded |
| `has_pitch` | boolean | `true` | Proposal/pitch file uploaded |
| `deal_closed` | boolean | `true` | MOU deal closed or proposal completed |

**Example requests:**

```
GET /api/proposals/all
GET /api/proposals/all?status=approved
GET /api/proposals/all?sector=Agri-chemicals%20%26%20Inputs&mou_status=uploaded
GET /api/proposals/all?q=Khan&has_mou=true
GET /api/proposals/all?date_from=2024-06-01&date_to=2024-06-30&deal_closed=false
GET /api/proposals/all?status=approved&sector=Agri-chemicals%20%26%20Inputs&mou_status=signed&has_pitch=true
```

**Response:** same array shape as before (proposal objects with poke status, display_title, etc.)

**Error `400` examples:**

```json
{ "error": "Invalid status filter" }
{ "error": "Invalid sector filter" }
{ "error": "Invalid mou_status filter" }
{ "error": "Invalid date_from — use YYYY-MM-DD" }
{ "error": "Invalid has_mou filter — use true or false" }
```

---

## 5. Suggested Super Admin filter bar UI

```
[ Search: title, party, sector...     ]  [Sector ▼]  [Status ▼]  [MOU Status ▼]

[ Has MOU ▼ ]  [ Has Pitch ▼ ]  [ Deal Closed ▼ ]  [ From date ]  [ To date ]  [Clear]
```

On any filter change → rebuild query string → `GET /api/proposals/all?...`

**Status tabs** (All / Draft / Submitted / Approved / Rejected) can stay — map to `?status=` param.

**Summary cards** (TOTAL, DRAFT, etc.):

- Option A: fetch unfiltered list once and count client-side (small datasets)
- Option B: separate stats API (not built yet) — use Option A for now

---

## 6. MOU status values (for MOU Status dropdown)

| Value | Meaning |
|-------|---------|
| `not_started` | No MOU work yet |
| `in_progress` | MOU fields filled, no file |
| `uploaded` | MOU file on record |
| `signed` | Both parties acknowledged (or historic exempt) |
| `deal_closed` | Deal closed by SL/SA |

List items already include `mou_status` on each proposal row from `GET /all`.

---

## 7. Deploy checklist

```bash
# 1. Deploy backend code
# 2. Run migration (once)
npm run db:migrate:historic-mou-ack-exempt

# 3. Restart API
npm start

# 4. Deploy frontend with:
#    - Hide ack section when acknowledgment_required === false
#    - New filter bar on Super Admin All Opportunities page
```

---

## 8. Quick test

1. Login as `superadmin@test.com`
2. Open historic proposal MOU tab → `GET .../mou/status` → `acknowledgment_required: false`
3. Ack section should not render
4. `GET /api/proposals/filter-options` → sectors + statuses returned
5. `GET /api/proposals/all?sector=Agri-chemicals%20%26%20Inputs` → filtered list
6. Create brand-new approved proposal with new MOU upload → `acknowledgment_required: true`

---

## Related docs

- `STEP17_MOU_ACKNOWLEDGMENT_API.md` — original acknowledgment flow (still applies to new MOUs)
- `STEP14_SUPER_ADMIN_MODULES.md` — Super Admin module map
- `STEP15_PROPOSAL_MOU_API.md` — MOU upload/view

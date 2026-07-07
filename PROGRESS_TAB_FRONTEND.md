# Progress Tab — Frontend Integration

**Replaces:** "Activities" tab terminology and approval workflow  
**Backend:** `http://localhost:5000` (or production API host)  
**Auth:** `Authorization: Bearer <token>`

---

## Summary of changes

| Before | After |
|--------|-------|
| Tab label **Activities** | Tab label **Progress** |
| Manual entry → `pending` → SL approves | Auto **Recorded** — no approval |
| MOU field edits separate | Only **Progress** field on MOU → auto row in Progress tab |
| Card/timeline UI | **Table** (Excel-like) + download |
| Approve / Reject buttons | **Remove** |

---

## One-time migration (server)

```bash
npm run db:migrate:progress-no-approval
```

Adds `recorded` status, `source`, `synced_fields`; converts old pending rows to recorded.

---

## 1. List progress updates (table data)

```
GET /api/proposals/:id/activities
```

Same URL for backward compatibility — response shape expanded.

**Response:**

```json
{
  "progress_updates": [
    {
      "id": 12,
      "progress_date": "2026-07-06",
      "activity_date": "2026-07-06",
      "title": "MOU progress fields updated",
      "description": "Progress: in progress → completed\nBottleneck: nil → license pending",
      "status": "recorded",
      "status_label": "Recorded",
      "source": "mou_field_sync",
      "source_label": "MOU fields",
      "synced_fields": [
        { "field": "executive_summary.progress", "label": "Progress", "old_value": "in progress", "new_value": "completed" }
      ],
      "added_by_name": "Dr. Amer Mumtaz, FSRI-PARC",
      "added_by_role": "sector_lead",
      "approval_required": false,
      "can_approve": false,
      "can_reject": false,
      "comments": [],
      "sheet_row": {
        "progress_date": "2026-07-06",
        "title": "MOU progress fields updated",
        "description": "Progress: in progress → completed",
        "status": "Recorded",
        "added_by_name": "Dr. Amer Mumtaz, FSRI-PARC",
        "added_by_role": "sector_lead",
        "source": "mou_field_sync",
        "source_label": "MOU fields",
        "comments": "",
        "support_file_url": ""
      }
    }
  ],
  "activities": [],
  "approval_required": false,
  "sheet_columns": [
    { "key": "progress_date", "label": "Progress Date" },
    { "key": "recorded_at", "label": "Recorded At" },
    { "key": "title", "label": "Title" },
    { "key": "description", "label": "Description" },
    { "key": "status", "label": "Status" },
    { "key": "added_by_name", "label": "Added By" },
    { "key": "added_by_role", "label": "Added By Role" },
    { "key": "source", "label": "Source" },
    { "key": "comments", "label": "Comments" },
    { "key": "support_file_url", "label": "Support File URL" }
  ],
  "progress_rows": [],
  "count": 1,
  "pending_count": 0
}
```

**UI:** Render `progress_rows` as HTML table (or `sheet_columns` + `progress_updates`).

- Hide **Status** column badge colors for pending/approve — show `Recorded` (green/neutral)
- Hide **Approve / Reject** actions entirely when `approval_required === false`
- Rename tab: `Activities` → **Progress**
- Rename button: `Add Activity` → **Add Progress Update**
- Banner: `ACTIVITIES 1 (1 pending)` → `PROGRESS 1` (use `count`, not pending)

---

## 2. Auto-sync from Edit MOU fields

When user saves the **Progress** field via:

```
PATCH /api/proposals/:id/fields
```

Backend auto-creates a progress row **only when `executive_summary.progress` changes**.

| Field path | Progress tab row? |
|------------|-------------------|
| `executive_summary.progress` | ✅ Yes |
| `executive_summary.bottlenecks` | ❌ No |
| `executive_summary.tentative_timeline` | ❌ No |
| `executive_summary.mou_operational_status` | ❌ No |
| `executive_summary.current_status` | ❌ No |
| `executive_summary.action_taken` | ❌ No |
| `executive_summary.location` | ❌ No |
| `proposal_description` | ❌ No |

Other MOU fields still save on MOU Details — they just do **not** appear in the Progress tab log.

**Response includes (only when Progress changed):**

```json
{
  "message": "Proposal fields updated successfully",
  "progress_sync": {
    "id": 15,
    "changes": [
      { "field": "executive_summary.progress", "label": "Progress", "old_value": "in progress", "new_value": "completed" }
    ]
  }
}
```

**Frontend after save:**
1. Refetch `GET /api/proposals/:id/activities` OR append new row from `progress_sync`
2. Refresh Progress tab table

**Synced row defaults:**
- `title`: `"Progress field updated"`
- `description`: `"Progress: old → new"`
- `source`: `mou_field_sync`
- `status`: `recorded`

**List filter:** API hides old `mou_field_sync` rows that were only Location / Bottleneck / etc. Manual entries always show.

### Reverse sync — Progress tab → MOU Details

Jab Sector Lead **MOU fields** wali progress row (`source: mou_field_sync`) edit kare, backend automatically **MOU Details** fields update karta hai.

**Trigger:** `PATCH /api/activities/:activityId` jab row ka `source === "mou_field_sync"` ho aur `description` change ho.

**Description format** (har line):

```
Progress: old value → new value
Bottleneck: nil → nil1
```

`→` ya `->` dono accept hain. Parser **arrow ke baad wali value** MOU field mein likhta hai.

**Optional explicit body** (parser ke bina):

```json
{
  "mou_field_values": {
    "progress": "11",
    "bottlenecks": "nil1",
    "location": "islamabad"
  }
}
```

**Response** mein `mou_sync` object:

```json
{
  "id": 15,
  "description": "Progress: 555 → 11",
  "mou_sync": {
    "synced": true,
    "applied_fields": {
      "executive_summary.progress": "11"
    },
    "mou_fields": {
      "progress": "11",
      "bottlenecks": "nil1",
      "tentative_timeline": "nil",
      "mou_operational_status": "Inactive",
      "current_status": "",
      "action_taken": "",
      "location": "islamabad",
      "proposal_description": "To establish agricultural products..."
    }
  }
}
```

**Frontend after save on `mou_field_sync` row:**
1. Progress table row response se update karo
2. **MOU Details tab** ke liye `GET /api/proposals/:id` dubara call karo (ya `mou_fields` / `mou_fields_synced` se local state patch karo)

**Manual progress rows** (`source: manual`) ab **MOU Details → Progress** field ko bhi update karti hain — timestamp ke sath.

---

## 3. Add manual progress update

```
POST /api/proposals/:id/activities
```

**Modal → API field mapping**

| Modal field | API field | Notes |
|-------------|-----------|-------|
| Work Date | `activity_date` | Aliases: `work_date`, `progress_date` |
| Title | `title` | Required |
| What was done? | `description` | **Required.** Aliases: `what_was_done`, `work_done` |
| Comment (optional) | `comment` | Saved as first comment |
| Proof file | `support_file_url` | Upload first, then send URL |

**Body:**

```json
{
  "activity_date": "2026-07-06",
  "title": "Site visit completed",
  "description": "What was done",
  "what_was_done": "What was done",
  "support_file_url": "http://localhost:5000/uploads/proof.pdf",
  "comment": "Optional — saved as first comment"
}
```

**Response `201`:** single progress object (`status: recorded`, `approval_required: false`)

- `description` → Progress tab **DESCRIPTION** column
- `recorded_at` → full timestamp (PKT), e.g. `7 Jul 2026, 12:38 pm` — table mein **Recorded At** column dikhao
- `mou_fields.progress` → MOU Details **Progress** field update hota hai: `[7 Jul 2026, 12:38 pm] What was done`

No approval step after create.

---

## 4. Comments — kahan se add karein? (Super Admin / Sector Lead)

**Important:** Edit progress modal (date / title / description) mein **comment field nahi hai** — comment alag action hai.

### Option A — Naya progress add karte waqt (recommended for first note)

`+ Add Progress Update` modal mein optional **Comment** field rakho:

```
POST /api/proposals/:id/activities
```

```json
{
  "activity_date": "2026-07-06",
  "title": "Site visit",
  "description": "Work done on site",
  "comment": "Verified by sector lead"
}
```

`comment` save hota hai → COMMENTS column mein dikhega.

### Option B — Existing row par comment (main flow)

Har table row par **"Add comment"** button (Edit/Delete ke saath):

```
POST /api/activities/:activityId/comments
```

```json
{ "comment": "Please update bottleneck details" }
```

**Roles:** `sector_lead`, `super_admin`, `admin`, `party_a`, `party_b`

**Response `201`:**

```json
{
  "id": 7,
  "activity_id": 12,
  "comment": "Please update bottleneck details",
  "commented_by_name": "Super Admin",
  "commented_by_role": "super_admin",
  "created_at": "2026-07-07T..."
}
```

Refetch progress list → `comments_display` update ho jayega.

### Option C — Row expand / thread (better UX)

```
GET /api/activities/:activityId/comments
```

Row click par neeche thread dikhao + "Write a comment…" input + Send.

### Kya Edit modal mein comment nahi?

- **Edit** = sirf progress row data (`PATCH /api/activities/:id`)
- **Comment** = alag conversation (`POST .../comments`)
- Multiple comments ek row par ho sakte hain — isliye Edit form ke andar merge nahi kiya

### Super Admin comment → lock (yaad rakho)

Jab **Super Admin** kisi **Sector Lead** ki row par comment kare (`POST .../comments`):

- `edit_locked: true` ho jata hai
- SL ko **Request edit access** karna padta hai
- SA **Grant edit access** se unlock karta hai

### Suggested ACTIONS column

| Button | Kab dikhao |
|--------|------------|
| **Edit** | `row.can_edit` |
| **Delete** | `row.can_delete` |
| **Comment** | hamesha (view access) |
| **Request edit access** | `row.can_request_unlock` |
| **Grant edit access** | `row.can_grant_unlock` |

```tsx
async function addProgressComment(activityId: number, text: string) {
  await api.post(`/api/activities/${activityId}/comments`, { comment: text });
  await refetchProgress();
}
```

---

## 5. Download progress Excel / CSV

```
GET /api/proposals/:id/progress/export?format=xlsx
GET /api/proposals/:id/progress/export?format=csv
```

**Roles:** same as view progress (`proposals.activities.view`)

**File:** `mou-278-progress.xlsx` — sheet **"Progress Updates"** with columns matching `sheet_columns`.

**UI:** Add **Download Progress** button on Progress tab (separate from full MOU report download).

Full report (`GET /api/proposals/:id/export-report?format=xlsx`) still has Summary + Progress Updates sheets — Progress sheet uses same column layout.

---

## 6. Comments display (fixed)

**Problem:** COMMENTS column showed `Name (role) [date]: text` — too noisy for table.

**Now:**
- Progress **table** UI → plain text only (`comments_display`, e.g. `423 | loced`)
- **Excel / CSV export** → one line per comment, newline-separated:

```
Dr. Amer Mumtaz, FSRI-PARC · sector_lead · 2026-07-07: 121213
Super Admin · super_admin · 2026-07-07: loced
```

- Full metadata in API `comments_detail[]` per row:

```json
"comments_detail": [
  {
    "id": 4,
    "comment": "423",
    "commented_by_name": "Dr. Amer Mumtaz, FSRI-PARC",
    "commented_by_role": "sector_lead",
    "created_at": "2026-07-07T..."
  }
]
```

**UI:** Show `comments_display` or `sheet_row.comments` in table. Use `comments_detail` for hover/tooltip or expand row.

---

## 7. CRUD — edit & delete progress

| Role | Edit | Delete |
|------|------|--------|
| **Super Admin / Admin** | Any progress row | Any row |
| **Sector Lead** | Own manual rows only | Own **manual** rows only |
| **Sector Lead** | Own `mou_field_sync` rows (if not locked) | ❌ cannot delete auto-sync rows |
| **Party A** | ❌ | ❌ |

### Update

```
PATCH /api/activities/:activityId
```

**Body (partial):**

```json
{
  "activity_date": "2026-07-06",
  "title": "Updated title",
  "description": "Progress: old → new",
  "support_file_url": "https://...",
  "mou_field_values": {
    "progress": "11",
    "bottlenecks": "nil1"
  }
}
```

**Response:** updated progress object with `can_edit`, `can_delete`, `edit_locked`, plus optional `mou_sync` when MOU fields were written back (see §2 reverse sync).

### Delete

```
DELETE /api/activities/:activityId
```

**Response:**

```json
{ "message": "Progress entry deleted successfully", "id": 12 }
```

### Row flags (per item in list)

```json
{
  "can_edit": true,
  "can_delete": false,
  "edit_locked": false,
  "unlock_requested": false,
  "can_request_unlock": false,
  "can_grant_unlock": false
}
```

Show **Edit** / **Delete** buttons only when `can_edit` / `can_delete` are true.

---

## 8. Edit lock after Super Admin comment

**Rule:** Jab **Super Admin** kisi **Sector Lead** ki progress par comment kare → woh row **locked** ho jati hai. Sector Lead tab tak edit nahi kar sakta jab tak Super Admin unlock na de.

### Flow

```
Super Admin comments on SL progress
        ↓
edit_locked = true
        ↓
Sector Lead → Request Edit Unlock
        ↓
Super Admin → Grant Edit Unlock
        ↓
edit_locked = false → SL can edit again
```

### Request unlock (Sector Lead)

```
POST /api/activities/:activityId/request-edit-unlock
```

**Body (optional):**

```json
{ "note": "Please allow me to fix the progress description" }
```

Sets `unlock_requested: true`, `can_grant_unlock: true` for Super Admin.

### Grant unlock (Super Admin / Admin)

```
PATCH /api/activities/:activityId/grant-edit-unlock
```

Clears lock + request. Sector Lead can edit again.

### UI

| State | Sector Lead sees | Super Admin sees |
|-------|------------------|------------------|
| Locked | 🔒 Locked — **Request edit access** button | 🔒 Locked — **Grant edit access** (if requested) |
| Unlock requested | "Waiting for Super Admin approval" | **Grant edit access** button |
| Unlocked | Edit / Delete enabled | Edit / Delete enabled |

---

## 9. Removed / deprecated

| Endpoint | New behaviour |
|----------|----------------|
| `PATCH /api/activities/:id/approve` | `400 Progress updates no longer require approval` |
| `PATCH /api/activities/:id/reject` | `400 Progress updates no longer require approval` |

Remove approve/reject UI from Progress tab.

**Poke flow unchanged:** `POST /api/proposals/:id/poke` still creates `Update Requested` (pending) — Party A responds separately.

---

## 9. Suggested Progress tab UI

```
┌─ Progress ─────────────────────────────────────────────┐
│  [ + Add Progress Update ]  [ Download Excel ▼ ]      │
│                                                       │
│  ┌──────────┬────────┬─────────────┬──────────┬─────┐ │
│  │ Date     │ Title  │ Description │ Added By │ Src │ │
│  ├──────────┼────────┼─────────────┼──────────┼─────┤ │
│  │ 6 Jul 26 │ MOU... │ Progress: … │ Dr. Amer │ MOU │ │
│  └──────────┴────────┴─────────────┴──────────┴─────┘ │
└───────────────────────────────────────────────────────┘
```

**Source column values:**
- `mou_field_sync` → badge **MOU fields**
- `manual` → **Manual entry**

---

## 10. Frontend code sketch

```tsx
// Tab
{ id: 'progress', label: `Progress (${progress.count})` }

// Load
const { data } = await api.get(`/api/proposals/${id}/activities`);
setProgressRows(data.progress_rows);
setApprovalRequired(data.approval_required); // false

// Table
<table>
  <thead>
    <tr>{data.sheet_columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
  </thead>
  <tbody>
    {data.progress_rows.map((row) => (
      <tr key={row.id}>
        {data.sheet_columns.map((c) => <td key={c.key}>{row[c.key]}</td>)}
      </tr>
    ))}
  </tbody>
</table>

// Download
window.location.href = `/api/proposals/${id}/progress/export?format=xlsx`;

// Comments column — plain text only
<td>{row.comments_display || row.sheet_row?.comments || '—'}</td>

// Edit / Delete / Lock
{row.can_edit && <button onClick={() => editProgress(row.id)}>Edit</button>}
{row.can_delete && <button onClick={() => deleteProgress(row.id)}>Delete</button>}
{row.can_request_unlock && (
  <button onClick={() => requestUnlock(row.id)}>Request edit access</button>
)}
{row.can_grant_unlock && (
  <button onClick={() => grantUnlock(row.id)}>Grant edit access</button>
)}
```

---

## 11. Test checklist

```bash
npm run db:migrate:progress-no-approval
npm run db:migrate:progress-edit-lock
```

1. Comments column shows `423` not `Name (role) [date]: 423`
2. SL edits own manual progress → `PATCH /api/activities/:id` works
3. SL cannot delete `mou_field_sync` rows
4. Super Admin edits/deletes any row
5. Super Admin comments on SL row → `edit_locked: true`, SL `can_edit: false`
6. SL `POST .../request-edit-unlock` → SA sees `can_grant_unlock: true`
7. SA `PATCH .../grant-edit-unlock` → SL can edit again

---

## Related

- `MOU_FULL_FIELD_EDIT_FRONTEND.md` — Edit MOU fields (triggers auto-sync)
- `STEP3_ACTIVITIES_API.md` — legacy activity API (superseded for approval flow)

# Party A — Poke Response & Proof Upload (Frontend Integration)

> **Superseded for poke answers:** use **`STEP3_POKE_LINKED_RESPONSE_API.md`** — responses are stored on the poke activity itself via `POST /api/activities/:activityId/respond`, not as a separate timeline entry.

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Use this document for proof upload details and general activity fields. For the poke respond UI, follow the linked-response doc above.

---

## What this feature does

When **Sector Lead** or **Super Admin** pokes a proposal, Party A can respond with:

| Field | Required | Notes |
|-------|----------|-------|
| Work date (`activity_date`) | Yes | **Past dates allowed** — actual date work happened |
| Title | Yes | Short summary e.g. "Site visit on 15 May" |
| Description | No | Detail of what was done |
| Proof document | No | PDF / DOC / DOCX upload |
| Comment | No | Saved as first comment on the activity |

After submit:
- New activity appears on timeline
- `poke_status` on proposal → **`answered`**
- Dashboard **Poke** column → `Poke by X · Answered`

Party A can still add **more comments** later on any activity (including poke rows).

---

## Setup (one time)

```bash
cd investment-portal-backend
npm run db:migrate:activity-support
npm run dev
```

Adds column: `proposal_activities.support_file_url`

---

## Poke status (dashboard column)

Every proposal list/detail includes `poke_status`:

```json
{
  "poke_status": {
    "status": "none | pending_response | answered",
    "poked_by_name": "Super Admin",
    "poked_by_role": "super_admin",
    "poked_by_label": "Super Admin",
    "poked_at": "2026-06-06T...",
    "answered_at": "2026-06-07T...",
    "label": "Super Admin poked — Awaiting Party A response",
    "short_label": "Poked by Super Admin · Pending"
  }
}
```

| status | Badge color | Meaning |
|--------|-------------|---------|
| `none` | — | No poke |
| `pending_response` | Amber | Poked, Party A has not responded |
| `answered` | Teal | Party A added activity after poke |

**Answered logic:** Party A creates any activity (title ≠ `Update Requested`) **after** the latest poke timestamp.

**APIs returning `poke_status`:**
- `GET /api/proposals/my`
- `GET /api/proposals/sector-lead`
- `GET /api/proposals/all`
- `GET /api/proposals/:id`

---

## UI flow (Party A)

```
1. Login as Party A
2. Dashboard → Poke column shows "Poked by X · Pending" (amber)
3. Open /proposals/:id
4. Amber banner: "Update requested" + [Respond to Poke] button
5. Fill form:
   - Work Date (past OK)
   - Title
   - What was done (description)
   - Upload proof (PDF/DOC)
   - Optional comment
6. Submit Update
7. Timeline shows new activity + proof link
8. Dashboard Poke → "Poked by X · Answered"
```

---

## APIs

### 1. Upload proof document

**POST** `/api/activities/upload`

**Roles:** `party_a` | `sector_lead` | `super_admin`

**Content-Type:** `multipart/form-data`  
**Field name:** `support_file`

- Allowed: PDF, DOC, DOCX
- Max: 10MB

**Response 200:**
```json
{
  "file_url": "http://localhost:5000/uploads/1749201234-987654321.pdf"
}
```

**Axios example:**
```js
const formData = new FormData()
formData.append('support_file', file)
const { data } = await client.post('/api/activities/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
})
// data.file_url → pass to create activity
```

---

### 2. Create activity (poke response)

**POST** `/api/proposals/:proposalId/activities`

**Roles:** `party_a` | `sector_lead` | `super_admin`  
**Party A:** own proposals only

**Body:**
```json
{
  "activity_date": "2026-05-15",
  "title": "Site inspection completed",
  "description": "Visited site, met local officials, photos attached",
  "support_file_url": "http://localhost:5000/uploads/....pdf",
  "comment": "Please review attached inspection report"
}
```

| Field | Required |
|-------|----------|
| `activity_date` | Yes — any date (past/future) |
| `title` | Yes |
| `description` | No |
| `support_file_url` | No — from upload API |
| `comment` | No — creates first row in `activity_comments` |

**Response 201:** full activity object with `comments`, `approvals`, `support_file_url`

```json
{
  "id": 12,
  "proposal_id": 6,
  "activity_date": "2026-05-15",
  "title": "Site inspection completed",
  "description": "...",
  "support_file_url": "http://localhost:5000/uploads/....pdf",
  "status": "pending",
  "added_by_name": "Party A Test User",
  "added_by_role": "party_a",
  "comments": [
    {
      "id": 1,
      "comment": "Please review attached inspection report",
      "commented_by_name": "Party A Test User",
      "commented_by_role": "party_a",
      "created_at": "..."
    }
  ],
  "approvals": []
}
```

---

### 3. Add comment later (timeline)

**POST** `/api/activities/:activityId/comments`

**Body:** `{ "comment": "required text" }`

**Response 201:** created comment

---

### 4. Poke (Sector Lead / Super Admin)

**POST** `/api/proposals/:proposalId/poke`

Creates system activity:
- `title`: `"Update Requested"`
- `description`: `"Please provide latest update on this proposal"`
- `activity_date`: today

---

## Frontend components (already built — verify)

| File | Purpose |
|------|---------|
| `src/components/PokeStatusBadge.jsx` | Dashboard Poke column |
| `src/pages/proposals/ProposalDetail.jsx` | Banner + Respond form + timeline |
| `src/api/activities.js` | `uploadActivitySupport()`, `createActivity()` |

### Dashboard table — add column

```jsx
<th>Poke</th>
// ...
<td><PokeStatusBadge pokeStatus={p.poke_status} /></td>
```

### Proposal detail — respond modal fields

```jsx
- activity_date   (type="date", past allowed)
- title           (text)
- description     (textarea, label: "What was done?")
- support_file    (file input → POST /api/activities/upload)
- comment         (textarea, optional)
```

### Timeline activity card — show proof

```jsx
{activity.support_file_url && (
  <DocLink
    url={activity.support_file_url}
    title="View proof document"
    onOpen={(url) => openPreview(url)}
  />
)}
```

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Party A | `partya@test.com` | `password123` |
| Sector Lead | `sectorlead@test.com` | `password123` |
| Super Admin | `superadmin@test.com` | `password123` |

### Test steps

1. **Super Admin** → open proposal → **Poke for Update**
2. Check dashboard → Poke = `Pending`
3. **Party A** → same proposal → **Respond to Poke**
4. Date = past date, upload PDF, add comment → Submit
5. Dashboard → Poke = `Answered`
6. Timeline → new activity + proof link + comment visible
7. **Sector Lead** → can Approve/Reject the new activity

---

## Errors

```json
{ "error": "message" }
```

| Code | Example |
|------|---------|
| 400 | Missing title, file too large, wrong file type |
| 403 | Wrong role / wrong proposal |
| 401 | Invalid token |

---

## Do NOT confuse

| Item | Poke activity | Party A response |
|------|---------------|------------------|
| Title | `Update Requested` (system) | User-defined e.g. "Site visit done" |
| Created by | Sector Lead / Super Admin | Party A |
| Counts as poke answer? | No | **Yes** — clears pending poke |

---

## Related docs

- `STEP3_ACTIVITIES_API.md` — full activity system
- `STEP2_SECTOR_REVIEW_API.md` — proposal approve/reject
- `FRONTEND_INTEGRATION.md` — Party A 3-step form

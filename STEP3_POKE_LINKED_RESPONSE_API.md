# Linked Poke Response — Frontend Integration

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Use this document to show **Party A's poke answer on the same poke activity card** (work date, proof document, comment) instead of creating a separate timeline entry.

---

## What changed

| Before | After |
|--------|-------|
| Party A responded via `POST /api/proposals/:id/activities` | Party A responds via `POST /api/activities/:activityId/respond` |
| Response appeared as a new activity row | Response is embedded on the poke row as `poke_response` |
| `answered` when any activity created after poke | `answered` when poke row has `response_submitted_at` |

---

## Setup (one time)

```bash
cd investment-portal-backend
npm run db:migrate:poke-response
npm run dev
```

Adds columns on `proposal_activities`:

- `response_date`, `response_title`, `response_description`
- `response_support_file_url`, `response_submitted_at`, `response_by`

---

## New API — Respond to poke

**`POST /api/activities/:activityId/respond`**  
**Role:** `party_a` only (must own the proposal)

The `:activityId` must be the **poke activity** (`title = "Update Requested"`) that has not been answered yet.

### Request body

```json
{
  "activity_date": "2026-05-15",
  "title": "Site visit completed",
  "description": "Visited site and collected soil samples.",
  "support_file_url": "/uploads/activities/abc.pdf",
  "comment": "Please review the attached report."
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `activity_date` | Yes | Actual work date (past dates allowed) |
| `title` | Yes | Short summary of work done |
| `description` | No | Detail text |
| `support_file_url` | No | From upload API below |
| `comment` | No | Saved as comment on the **poke activity** |

### Success `200`

Returns the full updated poke activity (same shape as timeline items), including `poke_response` and any new comment.

### Errors

| Status | Message |
|--------|---------|
| 400 | Not a poke / already answered |
| 403 | Not Party A or wrong proposal |
| 404 | Activity not found |

---

## Proof upload (unchanged)

**`POST /api/activities/upload`**  
**Field:** `support_file` (multipart)  
**Roles:** `party_a`, `sector_lead`, `super_admin`

```json
{ "file_url": "/uploads/activities/xyz.pdf" }
```

Use the returned `file_url` as `support_file_url` in the respond body.

---

## Activity list — new fields on poke rows

**`GET /api/proposals/:proposalId/activities`**

Each activity may include:

```json
{
  "id": 12,
  "title": "Update Requested",
  "is_poke": true,
  "can_respond": false,
  "poke_response": {
    "work_date": "2026-05-15",
    "title": "Site visit completed",
    "description": "Visited site and collected soil samples.",
    "support_file_url": "/uploads/activities/abc.pdf",
    "submitted_at": "2026-06-07T10:30:00.000Z",
    "submitted_by_name": "Party A User"
  },
  "comments": [
    {
      "id": 5,
      "comment": "Please review the attached report.",
      "commented_by_name": "Party A User",
      "commented_by_role": "party_a",
      "created_at": "2026-06-07T10:30:00.000Z"
    }
  ]
}
```

| Field | When set | Meaning |
|-------|----------|---------|
| `is_poke` | Always on poke rows | `title === "Update Requested"` |
| `can_respond` | Party A + unanswered poke | Show "Respond to Poke" button |
| `poke_response` | After Party A submits | Embedded answer (date, doc, text) |
| `comments` | Always | Includes optional comment from respond |

---

## Poke status (dashboard column)

**`poke_status`** on proposal lists and `GET /api/proposals/:id`:

```json
{
  "status": "pending_response",
  "poke_activity_id": 12,
  "poked_by_name": "Sector Lead",
  "poked_by_label": "Sector Lead",
  "poked_at": "2026-06-06T...",
  "label": "Sector Lead poked — Awaiting Party A response",
  "short_label": "Poked by Sector Lead · Pending"
}
```

When answered:

```json
{
  "status": "answered",
  "poke_activity_id": 12,
  "answered_at": "2026-06-07T...",
  "answer_title": "Site visit completed",
  "label": "Sector Lead poked — Response submitted",
  "short_label": "Poked by Sector Lead · Answered"
}
```

**Answered logic:** latest poke row has `response_submitted_at` set (not a separate activity).

---

## Frontend flow

### 1. Detect pending poke

```js
proposal.poke_status.status === 'pending_response'
// use proposal.poke_status.poke_activity_id for respond target
```

Or on timeline:

```js
activity.can_respond === true
```

### 2. Upload proof (optional)

```js
const { file_url } = await uploadActivitySupport(file)
```

### 3. Submit response (linked to poke)

```js
await respondToPoke(pokeActivityId, {
  activity_date: '2026-05-15',
  title: 'Site visit completed',
  description: '...',
  support_file_url: file_url,
  comment: 'Optional note for reviewer',
})
```

**Do not** call `POST /api/proposals/:id/activities` for poke answers.

### 4. Render on poke card

Inside the poke `ActivityCard`, when `activity.poke_response` exists:

- Show work date (`poke_response.work_date`)
- Show title + description
- Link proof (`poke_response.support_file_url`)
- Show submitter + time
- Comments section shows response comment (and any later comments)

---

## API helper (frontend)

```js
// src/api/activities.js
export async function respondToPoke(activityId, data) {
  const response = await client.post(`/api/activities/${activityId}/respond`, data)
  return response.data
}
```

---

## Test checklist

1. Sector Lead pokes proposal → poke row appears, `can_respond: true`, badge **Pending**
2. Party A opens "Respond to Poke" on that card
3. Submits date + title + PDF + comment
4. Same poke card shows **Party A response** block (not a new activity)
5. `poke_status` → **Answered** on dashboard and detail
6. Sector Lead / Super Admin can still comment on the poke activity
7. Second respond attempt → `400` already answered

---

## Related docs

- `STEP3_ACTIVITIES_API.md` — activity timeline, poke, approve/reject
- `STEP3_POKE_RESPONSE_API.md` — older flow (separate activity); superseded by this doc for poke answers

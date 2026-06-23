# Step 4b — Complaint Workflow & Internal Timeline (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Use this document to integrate the **Regional FP review flow**, **send back to sector lead**, and **private internal timeline** (comments + documents).

For filing complaints, lists, and base APIs see **`STEP4_COMPLAINTS_API.md`**.

---

## What this adds

| Feature | Who |
|---------|-----|
| Resolve / Reject forwarded complaint | Regional FP |
| Send complaint back to sector lead | Regional FP |
| Resolve & notify Party A after return | Sector Lead |
| Re-forward after return | Sector Lead |
| Internal timeline (comments + docs) | Sector Lead, Regional FP, Super Admin |
| Public comments | Everyone (Party A sees only these) |

Party A **never** sees `internal_timeline`.

---

## Setup (one time)

```bash
cd investment-portal-backend
npm run db:migrate:complaint-workflow
npm run dev
```

Adds:
- Status `returned_to_sector_lead`
- `complaints.returned_at`, `complaints.returned_by`
- `complaint_comments.visibility` (`public` | `internal`)
- `complaint_comments.document_url`
- Action type `returned` in `complaint_actions`

---

## Status flow

```
open
  └─ Sector Lead forwards ──► forwarded
                                ├─ Regional FP resolves ──► resolved
                                ├─ Regional FP rejects  ──► rejected
                                └─ Regional FP returns  ──► returned_to_sector_lead
                                      ├─ Sector Lead resolves ──► resolved (Party A notified)
                                      └─ Sector Lead re-forwards ──► forwarded
```

| status | Badge suggestion | Who acts next |
|--------|------------------|---------------|
| `forwarded` | Purple | Regional FP |
| `returned_to_sector_lead` | Orange | Tagged Sector Lead |
| `resolved` | Green | Closed |
| `rejected` | Red | Closed |

---

## Role-based UI rules

### Regional Focal Point

Show action buttons when **all** are true:

```js
complaint.status === 'forwarded'
complaint.forwarded_to === currentUser.id
```

| Button | API |
|--------|-----|
| Resolve | `PATCH /api/complaints/:id/approve` |
| Reject | `PATCH /api/complaints/:id/reject` |
| Send Back to Sector Lead | `PATCH /api/complaints/:id/return` |

After return, Regional FP can still **view** the complaint (same `forwarded_to`) and post to **internal timeline** while status is `returned_to_sector_lead`.

### Sector Lead

Show review buttons when:

```js
complaint.tagged_sector_lead === currentUser.id
complaint.status !== 'forwarded'   // with Regional FP while forwarded
['open', 'under_review', 'returned_to_sector_lead'].includes(complaint.status)
```

| Button | When |
|--------|------|
| Resolve & Notify Party A | `returned_to_sector_lead` or `open` |
| Reject | Same |
| Forward to Regional FP | `open`, `under_review`, or `returned_to_sector_lead` |

When `returned_to_sector_lead`, show banner:

> Regional focal point returned this complaint. Review internal timeline, then resolve for Party A or forward again.

### Super Admin

- Sees **all** complaints via `GET /api/complaints/all`
- Can resolve / reject on any open complaint
- Sees internal timeline
- Cannot forward (sector lead only)

### Party A

- Sees `comments` only (public)
- Does **not** receive `internal_timeline` (empty / omitted)
- `can_view_internal_timeline: false`

---

## New API — Send back to sector lead

**`PATCH /api/complaints/:id/return`**  
**Role:** `regional_focal_point`  
**When:** `status === 'forwarded'` and `forwarded_to === current user`

### Request

```json
{
  "comment": "Need clarification from sector lead before closing."
}
```

`comment` is optional — if provided, saved to internal timeline.

### Response `200`

Full complaint object (see detail shape below) with `status: "returned_to_sector_lead"`.

### Errors

| Status | Reason |
|--------|--------|
| 400 | Not in `forwarded` status |
| 403 | Not the assigned Regional FP |

---

## Regional FP — resolve & reject

Same endpoints as sector lead; access is scoped to forwarded complaints.

### Resolve

**`PATCH /api/complaints/:id/approve`**

```json
{ "comment": "Issue addressed at regional level." }
```

### Reject

**`PATCH /api/complaints/:id/reject`**

```json
{ "comment": "Does not qualify as regional grievance." }
```

`comment` is **required** on reject.

---

## Sector Lead — re-forward after return

**`PATCH /api/complaints/:id/forward`**

Allowed when status is `returned_to_sector_lead` (not only first-time forward).

```json
{
  "regional_focal_point_id": 5,
  "comment": "Additional context attached."
}
```

Optional `comment` → saved as **internal** timeline entry.

---

## Document upload (all reviewer roles)

**`POST /api/complaints/upload`**  
**Roles:** `party_a`, `sector_lead`, `regional_focal_point`, `super_admin`  
**Field:** `document` (multipart, PDF/DOC/DOCX, max 10MB)

```json
{
  "file_url": "http://localhost:5000/uploads/complaints/1717600000-123.pdf"
}
```

Use `file_url` as `document_url` on internal timeline comments.

---

## Comments — public vs internal

**`POST /api/complaints/:id/comments`**

### Public comment (Party A can see)

```json
{
  "comment": "Thank you for the update.",
  "visibility": "public"
}
```

### Internal timeline entry (private)

```json
{
  "comment": "Please verify site visit report before we close.",
  "visibility": "internal",
  "document_url": "http://localhost:5000/uploads/complaints/abc.pdf"
}
```

| Rule | Behaviour |
|------|-----------|
| Party A posts | Always `public` (ignore `visibility`) |
| SL / RFP during `forwarded` or `returned_to_sector_lead` | Defaults to `internal` if `visibility` omitted |
| `document_url` | Optional attachment on any comment |

---

## Complaint detail — response shape

**`GET /api/complaints/:id`**

```json
{
  "id": 2,
  "title": "Delayed review",
  "status": "returned_to_sector_lead",
  "filed_by_name": "Party A — Ali Khan",
  "tagged_sector_lead": 3,
  "tagged_sector_lead_name": "Energy Sector Lead",
  "forwarded_to": 5,
  "forwarded_to_name": "Regional Focal Point — Punjab",
  "forwarded_at": "2026-06-06T10:00:00.000Z",
  "returned_at": "2026-06-07T14:00:00.000Z",
  "returned_by_name": "Regional Focal Point — Punjab",
  "can_view_internal_timeline": true,

  "comments": [
    {
      "id": 1,
      "comment": "We are looking into this.",
      "visibility": "public",
      "document_url": null,
      "commented_by_name": "Energy Sector Lead",
      "commented_by_role": "sector_lead",
      "created_at": "2026-06-06T..."
    }
  ],

  "internal_timeline": [
    {
      "id": 2,
      "comment": "Need more detail from sector lead.",
      "visibility": "internal",
      "document_url": "http://localhost:5000/uploads/complaints/report.pdf",
      "commented_by_name": "Regional Focal Point — Punjab",
      "commented_by_role": "regional_focal_point",
      "created_at": "2026-06-07T..."
    }
  ],

  "actions": [
    {
      "id": 1,
      "action": "forwarded",
      "action_by_name": "Energy Sector Lead",
      "action_by_role": "sector_lead",
      "comment": "Escalating to regional office.",
      "actioned_at": "2026-06-06T..."
    },
    {
      "id": 2,
      "action": "returned",
      "action_by_name": "Regional Focal Point — Punjab",
      "action_by_role": "regional_focal_point",
      "comment": "Need clarification.",
      "actioned_at": "2026-06-07T..."
    }
  ]
}
```

### Action history labels

| `action` | Display label |
|----------|---------------|
| `approved` | Resolved |
| `rejected` | Rejected |
| `forwarded` | Forwarded |
| `returned` | Returned to Sector Lead |

---

## Frontend API helpers

```js
// src/api/complaints.js

export async function returnComplaintToSectorLead(id, comment) {
  const { data } = await client.patch(`/api/complaints/${id}/return`, { comment })
  return data
}

export async function addComplaintComment(id, { comment, visibility, document_url }) {
  const { data } = await client.post(`/api/complaints/${id}/comments`, {
    comment,
    visibility,
    document_url,
  })
  return data
}

// Upload then attach to internal comment
export async function uploadComplaintDocument(file) {
  const formData = new FormData()
  formData.append('document', file)
  const { data } = await client.post('/api/complaints/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data // { file_url }
}
```

---

## Suggested UI — Complaint detail page

### Layout (top to bottom)

1. **Header** — title, status badge, filed by / date  
2. **Meta grid** — proposal, sector lead, forwarded to, returned at/by  
3. **Action buttons** — role + status dependent  
4. **Action history** — audit trail (`actions`)  
5. **Internal timeline** — only if `can_view_internal_timeline` (indigo/private styling)  
6. **Public comments** — visible to Party A  

### Internal timeline block

```
┌─ Internal Timeline ─────────────────────────────┐
│ Visible only to Sector Lead, Regional FP, Admin │
│                                                 │
│  ● Regional FP — 7 Jun 2026                     │
│    Need more detail from sector lead.           │
│    [View timeline document]                     │
│                                                 │
│  [textarea]                                     │
│  [file input]  Document attached ✓              │
│  [Add to Timeline]                              │
└─────────────────────────────────────────────────┘
```

Show compose form when:

```js
['forwarded', 'returned_to_sector_lead'].includes(complaint.status)
&& can_view_internal_timeline
```

Post with `visibility: 'internal'` and optional `document_url`.

### Permission helpers (copy-paste)

```js
export function canRfpActOnComplaint(complaint, userId) {
  return (
    complaint?.status === 'forwarded' &&
    complaint?.forwarded_to === userId
  )
}

export function canSectorLeadActOnComplaint(complaint, userId) {
  return (
    complaint?.tagged_sector_lead === userId &&
    complaint?.status !== 'forwarded' &&
    ['open', 'under_review', 'returned_to_sector_lead'].includes(complaint?.status)
  )
}

export function canPostInternalTimeline(complaint) {
  return ['forwarded', 'returned_to_sector_lead'].includes(complaint?.status)
}
```

### Status badge

Add style for `returned_to_sector_lead`:

```js
returned_to_sector_lead: 'bg-orange-100 text-orange-800 border-orange-200'
// label: "Returned to Sector Lead"
```

---

## Regional FP list

**`GET /api/complaints/forwarded`**

Returns complaints where `forwarded_to = current user` — includes items still `forwarded` and those `returned_to_sector_lead` (for continued internal discussion).

---

## Test flow

1. Login **Party A** → file complaint, tag Energy Sector Lead  
2. Login **Sector Lead** → open complaint → Forward to Punjab RFP  
3. Login **Regional FP** (`rfp@test.com`) → see in forwarded list  
4. Post internal note + upload PDF  
5. **Send Back to Sector Lead**  
6. Login **Sector Lead** → status orange “Returned” → read internal timeline  
7. Either:
   - **Resolve & Notify Party A** → Party A sees `resolved`, no internal timeline  
   - Or reply on internal timeline → Regional FP still sees conversation  
8. Login **Super Admin** → `GET /all` → open any complaint → sees internal timeline  

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Party A | `partya@test.com` | `password123` |
| Sector Lead | `sectorlead@test.com` | `password123` |
| Regional FP (Punjab) | `rfp@test.com` | `password123` |
| Regional FP (Sindh) | `rfp2@test.com` | `password123` |
| Super Admin | `superadmin@test.com` | `password123` |

---

## Related docs

- **`STEP4_COMPLAINTS_API.md`** — base complaint system (file, list, approve, reject, forward)
- **`STEP2_SECTOR_REVIEW_API.md`** — proposal review

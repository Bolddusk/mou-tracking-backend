# Step 4 — Complaints / Grievances (Frontend Integration)

> **Regional FP workflow & internal timeline:** see **`STEP4_COMPLAINT_WORKFLOW_API.md`** — return to sector lead, private SL↔RFP conversation, document uploads on timeline.

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Use this document to build complaint filing, review, forward, and comment flows for all roles.

---

## Setup (one time)

```bash
cd investment-portal-backend
npm run db:migrate:complaints
npm run db:seed          # adds regional_focal_point test user if missing
npm run dev
```

Creates tables: `complaints`, `complaint_comments`, `complaint_actions`

---

## Roles & dashboards

| Role | List API | Actions |
|------|----------|---------|
| `party_a` | `GET /api/complaints/my` | File complaint, view own, comment |
| `sector_lead` | `GET /api/complaints/sector` | Approve, reject, forward, comment |
| `super_admin` | `GET /api/complaints/all` | View all, approve, reject, comment |
| `regional_focal_point` | `GET /api/complaints/forwarded` | View forwarded, comment |

**Access rules:**
- Party A → only complaints they filed (`filed_by`)
- Sector Lead → only complaints tagged to them (`tagged_sector_lead`)
- Regional Focal Point → only complaints forwarded to them (`forwarded_to`)
- Super Admin → all complaints
- Forward is **one-time** — already `forwarded` complaints cannot be forwarded again
- **No delete** — all records kept; actions logged in `complaint_actions`

---

## Complaint status

| status | Meaning |
|--------|---------|
| `open` | Newly filed |
| `under_review` | Reserved (not auto-set yet) |
| `resolved` | Approved by sector lead / super admin |
| `rejected` | Rejected (comment required) |
| `forwarded` | Sector lead forwarded to regional focal point |
| `returned_to_sector_lead` | Regional FP sent complaint back to sector lead |

### Workflow (after forward)

```
Party A files → open
Sector Lead → forward → forwarded (Regional FP)
Regional FP → resolve | reject | send back → returned_to_sector_lead
Sector Lead (if satisfied) → resolve → Party A sees resolved
Sector Lead + Regional FP → internal timeline (comments + documents)
```

**Internal timeline:** comments with `visibility: "internal"` — only **sector_lead**, **regional_focal_point**, **super_admin** see them. Party A does not.

**Migration:**
```bash
npm run db:migrate:complaint-workflow
```

---

## Dropdown helpers

### Sector leads (complaint form)

**`GET /api/users/sector-leads`**  
**Auth:** any logged-in user

```json
[
  { "id": 3, "full_name": "Energy Sector Lead", "email": "sectorlead@test.com", "sector": "Energy & Power" }
]
```

Use in Party A complaint form to pick who to tag.

### Regional focal points (forward modal)

**`GET /api/users/regional-focal-points`**  
**Auth:** `sector_lead` only

```json
[
  { "id": 5, "full_name": "Regional Focal Point — Punjab", "email": "rfp@test.com", "sector": "Punjab Region" },
  { "id": 6, "full_name": "Regional Focal Point — Sindh", "email": "rfp2@test.com", "sector": "Sindh Region" }
]
```

---

## Document upload (optional)

**`POST /api/complaints/upload`**  
**Role:** `party_a`  
**Field:** `document` (multipart)  
**Types:** PDF, DOC, DOCX — max 10MB

```json
{ "file_url": "http://localhost:5000/uploads/complaints/1234567890-abc.pdf" }
```

You can either:
1. Upload first → pass `document_url` in create body, **or**
2. Send file directly on `POST /api/complaints` (same `document` field)

---

## File a complaint (Party A)

**`POST /api/complaints`**  
**Role:** `party_a`

### JSON body (after separate upload)

```json
{
  "proposal_id": 1,
  "tagged_sector_lead": 3,
  "title": "Delayed sector review",
  "description": "Proposal submitted 30 days ago with no update.",
  "document_url": "http://localhost:5000/uploads/complaints/abc.pdf"
}
```

### Multipart (single request)

| Field | Type | Required |
|-------|------|----------|
| `proposal_id` | number | Yes |
| `tagged_sector_lead` | number | Yes |
| `title` | string | Yes |
| `description` | string | Yes |
| `document` | file | No |

**Validations:**
- Proposal must belong to logged-in Party A
- `tagged_sector_lead` must be a user with role `sector_lead`

**Response `201`:** full complaint with `comments: []`, `actions: []`

```json
{
  "id": 1,
  "proposal_id": 1,
  "proposal_title": "Solar Farm Project",
  "proposal_sector": "Energy & Power",
  "filed_by": 1,
  "filed_by_name": "Party A — Ali Khan",
  "tagged_sector_lead": 3,
  "tagged_sector_lead_name": "Energy Sector Lead",
  "title": "Delayed sector review",
  "description": "...",
  "document_url": "http://localhost:5000/...",
  "status": "open",
  "forwarded_to": null,
  "forwarded_to_name": null,
  "forwarded_at": null,
  "created_at": "2026-06-04T...",
  "comments": [],
  "actions": []
}
```

---

## List complaints

### Party A — my complaints

**`GET /api/complaints/my`**

Returns array with `proposal_title`, `tagged_sector_lead_name`, `status`, etc.

### Sector Lead — tagged to me

**`GET /api/complaints/sector`**

Includes `filed_by_name`, `proposal_title`, `status`.

### Regional Focal Point — forwarded to me

**`GET /api/complaints/forwarded`**

Full details including `comments` and `actions` per item.

### Super Admin — all complaints

**`GET /api/complaints/all`**  
**Role:** `super_admin` only

Returns every complaint with `filed_by_name`, `tagged_sector_lead_name`, `forwarded_to_name`, `proposal_title`, `status`, etc.

---

## Complaint detail

**`GET /api/complaints/:id`**

**Roles:** `party_a`, `sector_lead`, `super_admin`, `regional_focal_point` (scoped by access rules)

```json
{
  "id": 1,
  "title": "...",
  "status": "open",
  "comments": [
    {
      "id": 1,
      "comment": "We are reviewing this week.",
      "commented_by": 3,
      "commented_by_name": "Energy Sector Lead",
      "commented_by_role": "sector_lead",
      "created_at": "..."
    }
  ],
  "actions": [
    {
      "id": 1,
      "action": "forwarded",
      "action_by_name": "Energy Sector Lead",
      "action_by_role": "sector_lead",
      "comment": "Escalating to regional office.",
      "actioned_at": "..."
    }
  ]
}
```

---

## Review actions

### Approve (resolve)

**`PATCH /api/complaints/:id/approve`**  
**Roles:** `sector_lead` (tagged only), `super_admin`

```json
{ "comment": "Issue addressed — closing complaint." }
```

- Sets `status` → `resolved`
- Logs `complaint_actions` row with `action: "approved"`

### Reject

**`PATCH /api/complaints/:id/reject`**  
**Roles:** `sector_lead` (tagged only), `super_admin`

```json
{ "comment": "Complaint does not meet grievance criteria." }
```

- `comment` is **required** (400 if missing)
- Sets `status` → `rejected`
- Logs `action: "rejected"`

### Forward to Regional FP

**`PATCH /api/complaints/:id/forward`**  
**Role:** `sector_lead` (must be tagged sector lead)

```json
{
  "regional_focal_point_id": 5,
  "comment": "Requires regional coordination."
}
```

- Allowed when status is `open`, `under_review`, or `returned_to_sector_lead` (re-forward)
- Sets `status` → `forwarded`, `forwarded_to`, `forwarded_at`
- Optional comment saved to **internal timeline**
- Logs `action: "forwarded"`

### Regional FP — resolve / reject

**`PATCH /api/complaints/:id/approve`** and **`PATCH /api/complaints/:id/reject`**  
**Role:** `regional_focal_point` when complaint is `forwarded` to them (super_admin always)

Same body as sector lead approve/reject.

### Send back to Sector Lead

**`PATCH /api/complaints/:id/return`**  
**Role:** `regional_focal_point` (only when `forwarded` to them)

```json
{ "comment": "Need more detail from sector lead." }
```

- Sets `status` → `returned_to_sector_lead`, `returned_at`, `returned_by`
- Logs `action: "returned"`
- Sector lead can then **Resolve & Notify Party A** or re-forward

---

## Comments & internal timeline

**`POST /api/complaints/:id/comments`**  
**Roles:** all four complaint roles (scoped access)

```json
{
  "comment": "Additional information attached.",
  "visibility": "public",
  "document_url": "http://localhost:5000/uploads/complaints/abc.pdf"
}
```

| Field | Notes |
|-------|-------|
| `comment` | Required |
| `visibility` | `public` (default) or `internal` |
| `document_url` | Optional — from `POST /api/complaints/upload` |

- Party A → always `public`
- During `forwarded` / `returned_to_sector_lead`, SL/RFP comments default to `internal`
- `GET /api/complaints/:id` returns `comments` (public) + `internal_timeline` (SL/RFP/super_admin only)

**Upload** (`POST /api/complaints/upload`) now allowed for: `party_a`, `sector_lead`, `regional_focal_point`, `super_admin`

---

## Frontend API helpers

```js
// src/api/complaints.js
import client from './client'

export async function getSectorLeads() {
  const { data } = await client.get('/api/users/sector-leads')
  return data
}

export async function getRegionalFocalPoints() {
  const { data } = await client.get('/api/users/regional-focal-points')
  return data
}

export async function uploadComplaintDocument(file) {
  const formData = new FormData()
  formData.append('document', file)
  const { data } = await client.post('/api/complaints/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function createComplaint(payload) {
  const { data } = await client.post('/api/complaints', payload)
  return data
}

export async function getMyComplaints() {
  const { data } = await client.get('/api/complaints/my')
  return data
}

export async function getSectorComplaints() {
  const { data } = await client.get('/api/complaints/sector')
  return data
}

export async function getForwardedComplaints() {
  const { data } = await client.get('/api/complaints/forwarded')
  return data
}

export async function getAllComplaints() {
  const { data } = await client.get('/api/complaints/all')
  return data
}

export async function getComplaintById(id) {
  const { data } = await client.get(`/api/complaints/${id}`)
  return data
}

export async function approveComplaint(id, comment) {
  const { data } = await client.patch(`/api/complaints/${id}/approve`, { comment })
  return data
}

export async function rejectComplaint(id, comment) {
  const { data } = await client.patch(`/api/complaints/${id}/reject`, { comment })
  return data
}

export async function forwardComplaint(id, regionalFocalPointId, comment) {
  const { data } = await client.patch(`/api/complaints/${id}/forward`, {
    regional_focal_point_id: regionalFocalPointId,
    comment,
  })
  return data
}

export async function addComplaintComment(id, comment) {
  const { data } = await client.post(`/api/complaints/${id}/comments`, { comment })
  return data
}
```

---

## Suggested UI pages

### Party A
- **Complaints list** (`/complaints`) — table from `GET /my`
- **File complaint** (`/complaints/new`) — pick own proposal + sector lead dropdown + form
- **Complaint detail** (`/complaints/:id`) — document link, comments thread, status badge

### Sector Lead
- **Complaints inbox** (`/complaints`) — `GET /sector`
- **Detail** — Approve / Reject / Forward buttons
- Forward modal → `GET /users/regional-focal-points` dropdown

### Regional Focal Point
- **Forwarded complaints** (`/complaints`) — `GET /forwarded`
- **Detail** — read-only actions audit + comment box

### Super Admin
- **All complaints** (`/complaints`) — `GET /all` table with filed by, sector lead, forwarded to
- **Detail** — Approve / Reject (no forward)

---

## Status badge colors (suggestion)

| status | Color |
|--------|-------|
| `open` | Blue |
| `under_review` | Amber |
| `resolved` | Green |
| `rejected` | Red |
| `forwarded` | Purple |

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Party A | `partya@test.com` | `password123` |
| Sector Lead | `sectorlead@test.com` | `password123` |
| Super Admin | `superadmin@test.com` | `password123` |
| Regional FP (Punjab) | `rfp@test.com` | `password123` |
| Regional FP (Sindh) | `rfp2@test.com` | `password123` |

### Test flow

1. Party A files complaint against own proposal, tags Energy Sector Lead  
2. Sector Lead sees it in `/api/complaints/sector`  
3. Sector Lead forwards to Regional FP  
4. Regional FP sees it in `/api/complaints/forwarded`  
5. Party A and RFP add comments  
6. Sector Lead approves or rejects another test complaint  

---

## Error responses

| Status | Example |
|--------|---------|
| 400 | Missing fields, invalid sector lead, already forwarded, reject without comment |
| 403 | Wrong role or complaint not yours / not tagged to you |
| 404 | Complaint not found |
| 401 | Missing or invalid token |

---

## Related docs

- `FRONTEND_INTEGRATION.md` — Party A proposals (pick proposal from `GET /api/proposals/my`)
- `STEP2_SECTOR_REVIEW_API.md` — proposal review
- `STEP3_ACTIVITIES_API.md` — activity timeline

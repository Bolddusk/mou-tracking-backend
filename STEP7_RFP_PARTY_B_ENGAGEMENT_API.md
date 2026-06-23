# Step 7 — Regional FP ↔ Party B Engagement (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Use this document to build the **Regional Focal Point → Party B** flow on forwarded complaints: tag, poke, comments, document upload, and return to sector lead with Party B documents.

For base complaints see **`STEP4_COMPLAINTS_API.md`**. For sector lead / RFP workflow see **`STEP4_COMPLAINT_WORKFLOW_API.md`**.

---

## What this adds

| Feature | Who |
|---------|-----|
| Tag Party B on forwarded complaint | Regional FP only |
| Poke Party B for documents/update | Regional FP only |
| Private engagement thread (comments + docs) | Regional FP ↔ Party B |
| Respond to poke with work date + document | Party B only |
| Return complaint to sector lead with Party B docs | Regional FP |
| View engagement history after return | Sector Lead |

**Rules:**
- Regional FP can **only** tag/poke **Party B** (from linked proposal `party_b_user_id`) — never Party A
- Party B sees **only** the engagement thread — not internal timeline or public complaint comments
- Return requires Party B to be tagged first; Party B documents are copied to sector lead **internal timeline**

---

## Setup (one time)

```bash
cd investment-portal-backend
npm run db:migrate:rfp-party-b
npm run dev
```

Adds:
- `complaints.party_b_user_id`, `party_b_tagged_at`, `party_b_tagged_by`
- Table `complaint_party_b_engagements` (tag, poke, comment, poke_response)

---

## Flow

```
Sector Lead forwards complaint
        ↓
Regional FP receives (status: forwarded)
        ↓
Regional FP tags Party B  ──► Party B gets access
        ↓
Regional FP pokes Party B (optional, one pending at a time)
        ↓
Party B + Regional FP exchange comments & documents
        ↓
Party B responds to poke (if poked)
        ↓
Regional FP returns to Sector Lead
        ↓
Party B documents attached to internal timeline
        ↓
Sector Lead resolves or re-forwards (existing APIs)
```

---

## Status & UI flags

On **`GET /api/complaints/:id`** and list endpoints, when engagement applies:

```json
{
  "party_b_engagement": {
    "tagged": true,
    "tagged_at": "2026-06-06T10:00:00.000Z",
    "party_b_user_id": 7,
    "party_b_name": "Li Wei",
    "party_b_email": "partyb@company.cn",
    "pending_poke_id": 12,
    "can_tag_party_b": false,
    "can_poke_party_b": true,
    "can_respond_to_poke": false,
    "can_return_to_sector_lead": true,
    "items": [ "...see thread shape below..." ]
  }
}
```

| Flag | Who sees `true` | When |
|------|-----------------|------|
| `can_tag_party_b` | Regional FP | `forwarded`, not yet tagged, proposal has Party B |
| `can_poke_party_b` | Regional FP | tagged, no pending unanswered poke |
| `can_respond_to_poke` | Party B | tagged, pending poke exists |
| `can_return_to_sector_lead` | Regional FP | tagged (engagement done when RFP decides) |

---

## Regional Focal Point UI

### List

```
GET /api/complaints/forwarded
```

Show **Tag Party B** when `party_b_engagement.can_tag_party_b`.

### 1. Tag Party B

**`POST /api/complaints/:id/tag-party-b`**  
**Role:** `regional_focal_point`  
**When:** `status === 'forwarded'`, not yet tagged, proposal has `party_b_user_id`

```json
{
  "comment": "Please assist with regional documentation for this grievance."
}
```

`comment` optional.

**Response `200`:** full complaint with `party_b_engagement.tagged: true`.

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | No linked Party B on proposal |
| 400 | Already tagged |
| 403 | Not assigned Regional FP |

### 2. Poke Party B

**`POST /api/complaints/:id/poke-party-b`**  
**Role:** `regional_focal_point`  
**When:** Party B tagged, no pending poke

```json
{
  "comment": "Please upload site visit report and MOU draft."
}
```

**Response `201`:**

```json
{
  "id": 12,
  "type": "poke",
  "author_name": "Regional FP Punjab",
  "author_role": "regional_focal_point",
  "comment": "Please upload site visit report...",
  "document_url": null,
  "can_respond": true,
  "is_answered": false,
  "created_at": "..."
}
```

### 3. Add comment / document (engagement thread)

**`POST /api/complaints/:id/party-b-engagement/comments`**  
**Roles:** `regional_focal_point`, `party_b` (tagged, `forwarded`)

```json
{
  "comment": "Attached revised schedule.",
  "document_url": "http://localhost:5000/uploads/complaints/abc.pdf"
}
```

Upload first via upload endpoint below. At least one of `comment` or `document` required.

### 4. Return to Sector Lead (with Party B docs)

**`PATCH /api/complaints/:id/return`**  
**Role:** `regional_focal_point`  
**When:** Party B tagged

```json
{
  "comment": "Party B provided required documents — please review and close for Party A."
}
```

**Response `200`:**

```json
{
  "status": "returned_to_sector_lead",
  "message": "Complaint returned to sector lead with Party B documents",
  "party_b_documents_forwarded": [
    {
      "source": "poke_response",
      "author_name": "Li Wei",
      "document_url": "http://localhost:5000/uploads/complaints/report.pdf",
      "title": "Site visit report"
    }
  ],
  "internal_timeline": [ "...includes forwarded Party B docs..." ]
}
```

All **Party B** documents from the engagement thread are copied to **internal timeline** for the sector lead.

**Requirement:** `party_b_tagged_at` must be set (400 if not tagged).

---

## Party B UI

### List assigned complaints

```
GET /api/complaints/party-b-assigned
```

Complaints where Regional FP tagged this Party B and status is still `forwarded`.

### Complaint detail

```
GET /api/complaints/:id
```

Party B sees:
- Complaint title, description, proposal info
- `party_b_engagement` thread only
- **No** `internal_timeline`, **no** `actions`, **no** public `comments`

### Respond to poke

**`POST /api/complaints/:id/party-b-engagement/respond`**  
**Role:** `party_b`

```json
{
  "activity_date": "2026-05-20",
  "title": "Site visit completed",
  "description": "Collected samples and photos.",
  "document_url": "http://localhost:5000/uploads/complaints/report.pdf",
  "comment": "Please find attached report."
}
```

| Field | Required |
|-------|----------|
| `activity_date` | Yes |
| `title` | Yes |
| `description` | No |
| `document_url` | No (from upload API) |
| `comment` | No |

**Response `201`:**

```json
{
  "id": 15,
  "type": "poke_response",
  "responds_to_id": 12,
  "poke_response": {
    "work_date": "2026-05-20",
    "title": "Site visit completed",
    "description": "Collected samples and photos.",
    "document_url": "http://localhost:5000/uploads/complaints/report.pdf"
  }
}
```

### Add comment / document

Same as Regional FP: `POST /api/complaints/:id/party-b-engagement/comments`

---

## Document upload

**`POST /api/complaints/:id/party-b-engagement/upload`**  
**Roles:** `regional_focal_point`, `party_b`  
**Field:** `document` (multipart, PDF/DOC/DOCX, max 10MB)

```json
{
  "file_url": "http://localhost:5000/uploads/complaints/1717600000-123.pdf"
}
```

Use `file_url` as `document_url` in comment or poke response body.

---

## Engagement thread API

**`GET /api/complaints/:id/party-b-engagement`**

**Roles:** `regional_focal_point` (assigned), `party_b` (tagged), `sector_lead` (after return), `super_admin`

```json
{
  "complaint_id": 5,
  "party_b_user_id": 7,
  "party_b_name": "Li Wei",
  "tagged_at": "2026-06-06T10:00:00.000Z",
  "pending_poke_id": null,
  "items": [
    {
      "id": 10,
      "type": "tag",
      "author_name": "Regional FP Punjab",
      "author_role": "regional_focal_point",
      "comment": "Tagged Party B for regional review.",
      "created_at": "..."
    },
    {
      "id": 12,
      "type": "poke",
      "author_name": "Regional FP Punjab",
      "comment": "Please upload documents.",
      "can_respond": false,
      "is_answered": true
    },
    {
      "id": 15,
      "type": "poke_response",
      "author_name": "Li Wei",
      "author_role": "party_b",
      "responds_to_id": 12,
      "poke_response": {
        "work_date": "2026-05-20",
        "title": "Site visit report",
        "document_url": "http://localhost:5000/uploads/complaints/report.pdf"
      }
    },
    {
      "id": 16,
      "type": "comment",
      "author_name": "Regional FP Punjab",
      "comment": "Received — reviewing.",
      "document_url": null
    }
  ]
}
```

---

## Sector Lead UI (after return)

When `status === 'returned_to_sector_lead'`:

1. Show banner: Regional FP returned complaint with Party B documents
2. Show `party_b_engagement.items` (read-only history)
3. Show `internal_timeline` — includes auto-forwarded Party B document entries
4. Actions (unchanged):
   - `PATCH /api/complaints/:id/approve` — resolve for Party A
   - `PATCH /api/complaints/:id/forward` — re-forward to Regional FP

---

## Frontend routes (suggested)

| Path | Role |
|------|------|
| `/dashboard/regional-focal/complaints/:id` | Regional FP — tag, poke, thread, return |
| `/dashboard/party-b/complaints` | Party B — assigned list |
| `/dashboard/party-b/complaints/:id` | Party B — thread, respond, upload |
| Sector lead complaint detail | Show Party B engagement + internal docs after return |

---

## API summary

| Action | Method | Endpoint | Role |
|--------|--------|----------|------|
| Assigned list | GET | `/api/complaints/party-b-assigned` | `party_b` |
| Tag Party B | POST | `/api/complaints/:id/tag-party-b` | `regional_focal_point` |
| Poke Party B | POST | `/api/complaints/:id/poke-party-b` | `regional_focal_point` |
| Get thread | GET | `/api/complaints/:id/party-b-engagement` | RFP, Party B, SL*, SA |
| Add comment/doc | POST | `/api/complaints/:id/party-b-engagement/comments` | RFP, Party B |
| Respond to poke | POST | `/api/complaints/:id/party-b-engagement/respond` | `party_b` |
| Upload doc | POST | `/api/complaints/:id/party-b-engagement/upload` | RFP, Party B |
| Return to SL | PATCH | `/api/complaints/:id/return` | `regional_focal_point` |

\* Sector lead: only when `returned_to_sector_lead`

---

## Test flow

1. Party A files complaint on approved proposal with Party B linked
2. Sector lead forwards to Regional FP (`PATCH /api/complaints/:id/forward`)
3. Regional FP tags Party B (`POST .../tag-party-b`)
4. Party B logs in → sees complaint in `/api/complaints/party-b-assigned`
5. Regional FP pokes → Party B responds with document
6. Both add comments as needed
7. Regional FP returns (`PATCH .../return`)
8. Sector lead sees Party B docs in internal timeline → resolves for Party A

---

## Related docs

- `STEP4_COMPLAINTS_API.md` — filing, lists, base review
- `STEP4_COMPLAINT_WORKFLOW_API.md` — forward, return, internal timeline
- `STEP5B_PARTY_B_API.md` — Party B login and proposal access

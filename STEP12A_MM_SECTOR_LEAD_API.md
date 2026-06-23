# Step 12A — Matchmaking: Sector Lead Review (Shortlist / Reject)

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

> **Context:** This is the **new matchmaking flow** — separate from legacy `/api/proposals`.  
> Party A already submitted via Step 12 (Pakistan proposal, no Party B / MOU).  
> Sector Lead now **evaluates** → shortlist or reject.

---

## Migration (run once)

```bash
npm run db:migrate:matchmaking-pakistan      # if not done
npm run db:migrate:matchmaking-sector-lead   # adds shortlisted/rejected + review columns
```

Optional seed (submitted test proposal):

```bash
npm run db:seed:matchmaking-pakistan
```

---

## Status flow (this step)

```
draft → submitted → shortlisted
                 ↘ rejected
```

| Status | Meaning |
|--------|---------|
| `draft` | Party A still editing (Sector Lead cannot see) |
| `submitted` | Waiting for Sector Lead evaluation |
| `shortlisted` | Sector Lead approved for next step (forward to China — coming next) |
| `rejected` | Sector Lead rejected (comment required) |

---

## Test credentials

| Role | Email | Password | Sector |
|------|-------|----------|--------|
| Party A | `partya@test.com` | `password123` | — |
| Sector Lead | `sectorlead@test.com` | `password123` | `Agri-chemicals & Inputs` |
| Super Admin | `superadmin@test.com` | `password123` | all sectors |

---

## APIs

### 1. List proposals (Sector Lead queue)

```
GET /api/matchmaking/pakistan/sector-lead
GET /api/matchmaking/pakistan/sector-lead?status=submitted
```

**Role:** `sector_lead` (own sector only) or `super_admin` (all sectors)

**Status filter values:** `submitted`, `shortlisted`, `rejected`, `forwarded_to_china`, `matched`  
Omit `status` to get all non-draft proposals in sector.

**Example response:**

```json
[
  {
    "id": 2,
    "party_a_id": 1,
    "party_a_name": "Party A — Ali Khan",
    "party_a_email": "partya@test.com",
    "sector": "Agri-chemicals & Inputs",
    "venture_name": "PK Matchmaking — GreenTech Agri JV — ...",
    "company_name": "GreenTech Pakistan",
    "status": "submitted",
    "submitted_at": "2026-06-08T11:04:00.000Z",
    "engagement_type": "B2B",
    "conference_info": { ... },
    "party_a_info": { ... },
    "executive_summary": { ... },
    "company_overview": { ... },
    "project_overview": { ... },
    "financials": { ... },
    "investment_ask": { ... },
    "contact_info": { ... }
  }
]
```

---

### 2. Proposal detail

```
GET /api/matchmaking/pakistan/:id
```

**Roles:**
- `party_a` — own proposals only
- `sector_lead` — same sector, not draft
- `super_admin` — any non-draft

---

### 3. Shortlist

```
PATCH /api/matchmaking/pakistan/:id/shortlist
```

**Role:** `sector_lead` or `super_admin`  
**Only when status = `submitted`**

**Body (optional comment):**

```json
{
  "comment": "Strong sector fit — forward to China matchmaking"
}
```

**Response:**

```json
{
  "message": "Proposal shortlisted",
  "proposal": {
    "id": 2,
    "status": "shortlisted",
    "shortlisted_at": "2026-06-08T12:00:00.000Z",
    "shortlisted_by": 3,
    "shortlisted_by_name": "Hasnain Lodhi",
    "sector_lead_comment": "Strong sector fit — forward to China matchmaking",
    "reviewed_by": 3,
    "reviewed_by_name": "Hasnain Lodhi",
    "reviewed_at": "2026-06-08T12:00:00.000Z"
  }
}
```

---

### 4. Reject

```
PATCH /api/matchmaking/pakistan/:id/reject
```

**Role:** `sector_lead` or `super_admin`  
**Only when status = `submitted`**  
**Comment required**

**Body:**

```json
{
  "comment": "Project scope does not align with sector priorities"
}
```

**Response:**

```json
{
  "message": "Proposal rejected",
  "proposal": {
    "id": 2,
    "status": "rejected",
    "sector_lead_comment": "Project scope does not align with sector priorities",
    "reviewed_by": 3,
    "reviewed_at": "2026-06-08T12:00:00.000Z"
  }
}
```

---

## Frontend UI suggestions

### Sector Lead dashboard tabs

| Tab | API call |
|-----|----------|
| Pending | `GET .../sector-lead?status=submitted` |
| Shortlisted | `GET .../sector-lead?status=shortlisted` |
| Rejected | `GET .../sector-lead?status=rejected` |
| All | `GET .../sector-lead` |

### Detail page actions (only if `status === 'submitted'`)

- **Shortlist** button → `PATCH .../shortlist`
- **Reject** button → modal with required comment → `PATCH .../reject`

### Important

- Use `/api/matchmaking/*` — **not** `/api/proposals/*`
- Legacy proposal approve/reject screens **do not** apply here
- After shortlist, next backend step will be **forward to China RFP** (not built yet)

---

## Quick Postman test

**1. Login as Sector Lead**

```
POST /api/auth/login
{ "email": "sectorlead@test.com", "password": "password123" }
```

**2. List pending**

```
GET /api/matchmaking/pakistan/sector-lead?status=submitted
Authorization: Bearer <token>
```

**3. Shortlist proposal #2**

```
PATCH /api/matchmaking/pakistan/2/shortlist
Authorization: Bearer <token>
{ "comment": "Approved for China forwarding" }
```

---

## Errors

| Code | Message |
|------|---------|
| 400 | Sector lead has no sector assigned |
| 400 | Only submitted proposals can be shortlisted or rejected |
| 400 | Comment is required when rejecting |
| 403 | Access denied — wrong sector |
| 404 | Proposal not found |

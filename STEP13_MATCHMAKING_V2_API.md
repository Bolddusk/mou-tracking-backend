# Step 13 — Matchmaking V2 (Chinese Investor → China FOP → PK Sector Lead Match)

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

> **V2 flow** — replaces V1 direction (PK forward to China FOP → RFP match → SL approve).

---

## Migrations (run once)

```bash
npm run db:migrate:chinese-investor-role
npm run db:migrate:matchmaking-china-v2
npm run db:migrate:matchmaking-matches-v2
npm run db:seed
```

---

## V2 flow

```
Chinese Investor → submit China proposal
       ↓
China FOP → shortlist → forward to PK Sector Lead (auto or manual by sector)
       ↓
Party A → PK proposal → PK Sector Lead shortlist
       ↓
PK Sector Lead → create MATCH (no approval) → engagement_proposal_id
       ↓
Chat + Activities + MOU
```

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Party A | `partya@test.com` | `password123` |
| Chinese Investor | `investor@test.com` | `password123` |
| China FOP | `rfp@test.com` | `password123` |
| Pakistan Sector Lead | `sectorlead@test.com` | `password123` |
| Sector | `Agri-chemicals & Inputs` | (SL + proposals) |

---

## Phase 1 — Chinese Investor

### Save draft

```
POST /api/matchmaking/china/draft
```

**Role:** `chinese_investor`

Same body fields as legacy China upload (`STEP12D`) — sector, venture_name, executive_summary, etc.

**Response:** `{ "china_proposal_id": 1, "status": "draft" }`

### Submit

```
POST /api/matchmaking/china/submit
{ "proposal_id": 1 }
```

Status → `submitted` — appears in China FOP queue.

### My proposals

```
GET /api/matchmaking/china/my
GET /api/matchmaking/china/my?status=submitted
```

**Response:** `{ "proposals": [...], "count": N }`

### Upload files

```
POST /api/matchmaking/china/upload
```

Multipart: `proposal_file`, `company_logo`, `cover_image`

---

## Phase 2 — China FOP (all proposals)

China FOP sees **every** submitted China proposal (not only own uploads).

### List queue

```
GET /api/matchmaking/fop/china
GET /api/matchmaking/fop/china?status=submitted
GET /api/matchmaking/fop/china?status=shortlisted
GET /api/matchmaking/fop/china?sector=Agri-chemicals%20%26%20Inputs
```

**Role:** `regional_focal_point`

**Statuses:** `submitted`, `shortlisted`, `rejected`, `forwarded_to_pakistan`, `matched`, `active` (legacy)

**Response:**

```json
{
  "proposals": [
    {
      "id": 3,
      "venture_name": "SinoAgri Tech JV",
      "sector": "Agri-chemicals & Inputs",
      "status": "submitted",
      "investor_name": "Li Wei — SinoAgri",
      "investor_email": "investor@test.com"
    }
  ],
  "count": 1
}
```

### Detail

```
GET /api/matchmaking/fop/china/:id
```

### Shortlist

```
PATCH /api/matchmaking/fop/china/:id/shortlist
{ "comment": "Strong fit for Pakistan JV" }
```

Status: `submitted` → `shortlisted`

### Reject

```
PATCH /api/matchmaking/fop/china/:id/reject
{ "comment": "Required reason" }
```

### Forward options (auto + manual UI)

```
GET /api/matchmaking/fop/china/:id/forward-options
```

**Only when** status = `shortlisted`

**Response:**

```json
{
  "china_proposal_id": 3,
  "sector": "Agri-chemicals & Inputs",
  "suggested_sector_lead": {
    "id": 2,
    "full_name": "Hasnain Lodhi",
    "email": "sectorlead@test.com",
    "sector": "Agri-chemicals & Inputs"
  },
  "auto_forward_available": true,
  "sector_leads": [ ... ],
  "hint": "Sector \"Agri-chemicals & Inputs\" → forward to Hasnain Lodhi (auto)"
}
```

**Frontend UI:**
- Button **"Auto-forward to sector lead"** → `auto_forward: true`
- Dropdown **manual pick** → `sector_lead_id` from `sector_leads` list
- Show `suggested_sector_lead` prominently when `auto_forward_available`

### Forward to Pakistan Sector Lead

```
PATCH /api/matchmaking/fop/china/:id/forward-pakistan
```

**Option A — Auto (by sector):**

```json
{ "auto_forward": true }
```

**Option B — Manual:**

```json
{ "auto_forward": false, "sector_lead_id": 2 }
```

**Rules:**
- Proposal must be `shortlisted`
- Manual: `sector_lead_id` required; SL `sector` must match proposal `sector`
- Auto: finds SL where `users.sector = proposal.sector`

Status → `forwarded_to_pakistan`

**Helper (all sector leads):**

```
GET /api/users/sector-leads
GET /api/users/sector-leads?sector=Agri-chemicals%20%26%20Inputs
```

**Role:** `regional_focal_point`, `sector_lead`, `super_admin`

---

## Phase 3 — Pakistan Sector Lead

### PK proposals (unchanged)

```
GET /api/matchmaking/pakistan/sector-lead?status=shortlisted
PATCH /api/matchmaking/pakistan/:id/shortlist
```

**Do not use** `forward-china` in V2.

### Forwarded China inbox

```
GET /api/matchmaking/china/sector-lead
GET /api/matchmaking/china/sector-lead?status=forwarded_to_pakistan
```

**Role:** `sector_lead` — proposals where `forwarded_to_sl` = you and `sector` = your sector.

### Create match (NO approval)

```
POST /api/matchmaking/sector-lead/matches
```

```json
{
  "pk_proposal_id": 6,
  "china_proposal_id": 3,
  "comment": "Sector match — proceed to engagement"
}
```

**Rules:**
- PK: `shortlisted`, same sector as SL
- China: `forwarded_to_pakistan`, `forwarded_to_sl` = you, same sector
- **Instant:** `status: approved`, `engagement_proposal_id` created, Party B provisioned

**Response (201):**

```json
{
  "match_id": 3,
  "message": "Match created — engagement ready (no approval step)",
  "engagement_proposal_id": 36,
  "match": { ... },
  "party_b": { ... }
}
```

### List SL matches

```
GET /api/matchmaking/sector-lead/matches
GET /api/matchmaking/sector-lead/matches?status=approved
```

---

## Phase 4 — Post-match (reuse)

| Feature | API |
|---------|-----|
| Engagement detail | `GET /api/proposals/:engagement_proposal_id` |
| Chat | `GET /api/proposals/:id/messages` + Socket |
| Activities | `GET /api/proposals/:id/activities` |
| MOU | `GET /api/matchmaking/matches/:match_id/mou` |

---

## Frontend routes (suggested)

| Role | Route |
|------|-------|
| Chinese Investor | `/matchmaking/china-investor` |
| China FOP | `/matchmaking/fop/china` |
| China FOP forward | `/matchmaking/fop/china/:id/forward` |
| PK Sector Lead PK queue | `/matchmaking/sector-lead/pakistan` |
| PK Sector Lead China inbox | `/matchmaking/sector-lead/china` |
| PK Sector Lead matching | `/matchmaking/sector-lead/match` |
| Engagement | `/proposals/:engagement_proposal_id` |

---

## Status reference

**China (`mm_china_proposals`):**

| Status | Meaning |
|--------|---------|
| `draft` | Investor editing |
| `submitted` | In China FOP queue |
| `shortlisted` | FOP approved |
| `rejected` | FOP rejected |
| `forwarded_to_pakistan` | Sent to PK SL |
| `matched` | SL created match |

**PK (`mm_pakistan_proposals`):**

| Status | Meaning |
|--------|---------|
| `submitted` | Awaiting SL |
| `shortlisted` | Ready for matching |
| `matched` | SL matched |

**Match (`mm_matches`):**

| Status | Meaning |
|--------|---------|
| `approved` | Created instantly by SL (V2) |

---

## Deprecated V1 APIs (do not use in new UI)

| Old API | V2 replacement |
|---------|----------------|
| `PATCH /pakistan/:id/forward-china` | Not used |
| `POST /rfp/china` (FOP upload) | `POST /china/submit` (investor) |
| `GET /rfp/pakistan` | Not used |
| `POST /rfp/matches` | `POST /sector-lead/matches` |
| `PATCH /rfp/matches/:id/submit-review` | Not used |
| `PATCH /matches/:id/approve` | Not used |

---

## E2E test order

1. `investor@test.com` — draft + submit China proposal (Agri-chemicals)
2. `rfp@test.com` — `GET /fop/china` → shortlist → `GET forward-options` → auto forward
3. `partya@test.com` — submit PK (or seed) → `sectorlead@test.com` shortlist PK
4. `sectorlead@test.com` — `GET /china/sector-lead` + `GET /pakistan/sector-lead?status=shortlisted`
5. `POST /sector-lead/matches` → save `engagement_proposal_id`
6. Chat / MOU on engagement

---

## Errors

| Code | Message |
|------|---------|
| 400 | No sector lead for sector (auto forward) |
| 400 | sector_lead_id required when auto_forward false |
| 400 | Sector Lead sector must match proposal sector |
| 403 | China proposal not forwarded to you |

# Step 12H — Matchmaking: MOU Upload + Tracking

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

> After match **approved** (Step 12G), Party A / Party B / Sector Lead upload MOU on the linked engagement proposal.

---

## Migration (run once)

```bash
npm run db:migrate:matchmaking-mou
```

Adds to `mm_matches`: `mou_status`, `mou_uploaded_at`, `mou_uploaded_by`

---

## MOU status

| Status | Meaning |
|--------|---------|
| `not_started` | Default after match approve |
| `in_progress` | Text fields saved, no file yet |
| `uploaded` | MOU file uploaded |
| `signed` | Both parties signed (set manually via API) |

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Party A | `partya@test.com` | `password123` |
| Party B | (China contact email from match) | invite email |
| Sector Lead | `sectorlead@test.com` | `password123` |

---

## APIs

### 1. Get MOU status + fields

```
GET /api/matchmaking/matches/:id/mou
```

**Roles:** `party_a`, `party_b`, `sector_lead`, `super_admin`  
**Requires:** match `status = approved`

**Response:**

```json
{
  "match_id": 1,
  "engagement_proposal_id": 34,
  "mou_status": "not_started",
  "mou_uploaded_at": null,
  "mou": {
    "mou_scope": null,
    "mou_description": null,
    "mou_sector": null,
    "mou_demand": null,
    "mou_file_url": null
  }
}
```

---

### 2. Upload / save MOU

```
PATCH /api/matchmaking/matches/:id/mou
```

**JSON or multipart** (`mou_file` for PDF/DOC)

**Body example:**

```json
{
  "mou_scope": "Technology transfer JV",
  "mou_description": "Joint venture for agri-input blending...",
  "mou_sector": "Agri-chemicals & Inputs",
  "mou_demand": "Chinese equipment + operator training",
  "mou_status": "signed"
}
```

With file: multipart field `mou_file` + text fields.

**Auto status:** if `mou_file` uploaded and no `mou_status` → sets `uploaded`

**Response:**

```json
{
  "message": "MOU saved successfully",
  "match_id": 1,
  "engagement_proposal_id": 34,
  "mou_status": "uploaded",
  "mou_uploaded_at": "2026-06-08T16:00:00.000Z",
  "proposal": { "mou_file_url": "http://localhost:5000/uploads/...", ... }
}
```

---

### 3. Lookup match from engagement ID

```
GET /api/matchmaking/engagement/:engagementProposalId/match
```

Use when frontend only has `engagement_proposal_id` from approve response.

---

## Full engagement stack (after approve)

| Feature | API |
|---------|-----|
| Chat | `GET /api/proposals/:engagement_proposal_id/messages` + Socket Step 10 |
| Activities | `/api/proposals/:id/activities` |
| MOU | `/api/matchmaking/matches/:id/mou` |

---

## Frontend UI

**Route:** `/matchmaking/engagement/:matchId/mou`

1. If only `engagement_proposal_id` known → `GET /api/matchmaking/engagement/:id/match`
2. Load MOU → `GET /api/matchmaking/matches/:matchId/mou`
3. Form: scope, description, sector, demand + file upload
4. Submit → `PATCH /api/matchmaking/matches/:matchId/mou`
5. Show `mou_status` badge progression

---

## Postman test

```
GET /api/matchmaking/matches/1/mou

PATCH /api/matchmaking/matches/1/mou
Content-Type: multipart/form-data
mou_file: <pdf>
mou_scope: JV scope
mou_description: ...
mou_sector: Agri-chemicals & Inputs
mou_demand: ...
mou_status: signed
```

---

**Pipeline complete** — matchmaking flow end-to-end ready.

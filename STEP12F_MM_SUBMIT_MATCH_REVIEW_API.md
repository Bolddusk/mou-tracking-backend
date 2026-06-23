# Step 12F — Matchmaking: Send Match to Sector Lead for Review

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

> China RFP sends a `created` match to Pakistan Sector Lead.  
> **No new migration** — uses existing `mm_matches` table.

---

## Status flow (this step)

```
created → pending_sl_review
```

| Status | Who sees it |
|--------|-------------|
| `created` | China RFP only |
| `pending_sl_review` | China RFP + Pakistan Sector Lead |

---

## Test credentials

| Role | Email | Password | Sector |
|------|-------|----------|--------|
| China RFP | `rfp@test.com` | `password123` | — |
| Sector Lead | `sectorlead@test.com` | `password123` | Agri-chemicals & Inputs |

---

## APIs

### 1. RFP — Submit match for Sector Lead review

```
PATCH /api/matchmaking/rfp/matches/:id/submit-review
```

**Role:** `regional_focal_point` (must be match creator)  
**Only when status = `created`**

**Body:** empty `{}` or no body

**Response:**

```json
{
  "message": "Match sent to Pakistan Sector Lead for review",
  "match": {
    "id": 1,
    "status": "pending_sl_review",
    "submitted_for_review_at": "2026-06-08T15:00:00.000Z",
    "sector": "Agri-chemicals & Inputs",
    "pk_venture_name": "...",
    "cn_venture_name": "...",
    "party_a_name": "...",
    "cn_party_b_name": "Li Wei"
  }
}
```

---

### 2. RFP — Still see all matches (including pending)

```
GET /api/matchmaking/rfp/matches
GET /api/matchmaking/rfp/matches?status=pending_sl_review
```

---

### 3. Sector Lead — Pending match review queue

```
GET /api/matchmaking/matches/pending-review
```

**Role:** `sector_lead` (own sector) or `super_admin` (all)

**Response:**

```json
{
  "matches": [
    {
      "id": 1,
      "status": "pending_sl_review",
      "sector": "Agri-chemicals & Inputs",
      "pk_proposal_id": 3,
      "china_proposal_id": 1,
      "pk_venture_name": "PK Matchmaking — GreenTech...",
      "cn_venture_name": "CN Matchmaking — SinoAgri...",
      "party_a_name": "Party A — Ali Khan",
      "cn_party_b_name": "Li Wei",
      "cn_party_b_email": "liwei@china-agri.cn",
      "proposed_by_name": "Regional Focal Point — Punjab",
      "submitted_for_review_at": "2026-06-08T15:00:00.000Z"
    }
  ]
}
```

---

### 4. Match detail (RFP + Sector Lead + Super Admin)

```
GET /api/matchmaking/matches/:id
GET /api/matchmaking/rfp/matches/:id
```

**Sector Lead:** only `pending_sl_review` / `approved` / `rejected` in their sector.

---

## Frontend UI

### China RFP — Matches page

When `status === 'created'` → show **"Send to Sector Lead"** button  
→ `PATCH /api/matchmaking/rfp/matches/:id/submit-review`

After submit → status badge `pending_sl_review` (still visible in RFP list)

### Sector Lead — new section

**Route:** `/matchmaking/sector-lead/matches`  
**Tab:** Pending Match Reviews  
→ `GET /api/matchmaking/matches/pending-review`

Side-by-side PK vs China summary, sector, Party A + Chinese contact.

---

## Postman test

```
# RFP submit
PATCH /api/matchmaking/rfp/matches/1/submit-review
Authorization: Bearer <rfp_token>

# SL list
GET /api/matchmaking/matches/pending-review
Authorization: Bearer <sector_lead_token>
```

---

## Errors

| Code | Message |
|------|---------|
| 400 | Only created matches can be submitted |
| 403 | Not your match / wrong sector |
| 404 | Match not found |

---

**Next step (12G):** Sector Lead approve / reject match → Party B linked + engagement APIs.

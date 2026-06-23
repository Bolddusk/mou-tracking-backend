# Step 12E — Matchmaking: RFP Matches PK + China (Same Sector)

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

> China RFP links a **forwarded Pakistan proposal** with an **active China proposal** in the **same sector**.

---

## Migration (run once)

```bash
npm run db:migrate:matchmaking-matches
```

**Prerequisites:** Steps 12B–12D (forwarded PK proposal + China proposal exist).

---

## Match status (this step)

| Status | Meaning |
|--------|---------|
| `created` | Match made by RFP — not yet sent to Sector Lead |

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| China RFP | `rfp@test.com` | `password123` |

---

## APIs

### 1. Create match

```
POST /api/matchmaking/rfp/matches
```

**Role:** `regional_focal_point`

**Body:**

```json
{
  "pk_proposal_id": 2,
  "china_proposal_id": 1
}
```

**Rules:**
- PK: `forwarded_to_rfp` = you, `status` = `forwarded_to_china`
- China: `uploaded_by_rfp` = you, `status` = `active`
- **Same `sector`** on both
- PK cannot already have active match (`created` / `pending_sl_review` / `approved`)

**Response (201):**

```json
{
  "match_id": 1,
  "message": "Match created successfully — send to Sector Lead for review when ready",
  "match": {
    "id": 1,
    "status": "created",
    "sector": "Agri-chemicals & Inputs",
    "pk_proposal_id": 2,
    "china_proposal_id": 1,
    "pk_venture_name": "PK Matchmaking — GreenTech...",
    "cn_venture_name": "CN Matchmaking — SinoAgri...",
    "party_a_name": "Party A — Ali Khan",
    "cn_party_b_name": "Li Wei",
    "cn_party_b_email": "liwei@china-agri.cn"
  }
}
```

---

### 2. List my matches

```
GET /api/matchmaking/rfp/matches
GET /api/matchmaking/rfp/matches?status=created
GET /api/matchmaking/rfp/matches?sector=Agri-chemicals%20%26%20Inputs
```

---

### 3. Match detail

```
GET /api/matchmaking/rfp/matches/:id
```

---

## Frontend UI

**Route:** `/matchmaking/rfp/match` or modal from RFP dashboard

1. **Step 1:** Select PK proposal from `GET /api/matchmaking/rfp/pakistan`
2. **Step 2:** Filter China proposals same sector → `GET /api/matchmaking/rfp/china?sector=...`
3. **Step 3:** Confirm → `POST /api/matchmaking/rfp/matches`
4. **Matches list:** `GET /api/matchmaking/rfp/matches`
5. Show side-by-side: PK venture vs China venture, sector badge, status `created`

**Disable match** if sectors differ or PK already matched.

---

## Postman test

```
POST /api/auth/login
{ "email": "rfp@test.com", "password": "password123" }

POST /api/matchmaking/rfp/matches
{ "pk_proposal_id": 2, "china_proposal_id": 1 }

GET /api/matchmaking/rfp/matches
```

---

## Errors

| Code | Message |
|------|---------|
| 400 | Sector mismatch |
| 400 | PK already has active match |
| 403 | Proposal not forwarded to you |
| 404 | Proposal not found |

---

**Next step (12F):** Send match to Pakistan Sector Lead for review — `PATCH /api/matchmaking/rfp/matches/:id/submit-review`

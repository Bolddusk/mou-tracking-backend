# Step 12G — Matchmaking: Sector Lead Approve / Reject Match

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking` (approve/reject) + `/api/proposals` (engagement after approve)  
**Auth:** `Authorization: Bearer <token>`

> Sector Lead reviews PK–China match. On **approve**, backend creates an **engagement proposal** in legacy `proposals` table and links Party B from China proposal.

---

## Migration (run once)

```bash
npm run db:migrate:matchmaking-matched
```

Adds `matched` status to `mm_pakistan_proposals`.

---

## Status flow

```
pending_sl_review → approved | rejected
```

On approve:
- `mm_matches.status` = `approved`
- `mm_pakistan_proposals.status` = `matched`
- New row in `proposals` → `engagement_proposal_id`
- Party B provisioned from China proposal contact

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Sector Lead | `sectorlead@test.com` | `password123` |
| Party A | `partya@test.com` | `password123` |
| Party B | (from China proposal email) | invite email |

---

## APIs

### 1. Approve match

```
PATCH /api/matchmaking/matches/:id/approve
```

**Role:** `sector_lead` or `super_admin`  
**Only when status = `pending_sl_review`**

**Body (optional comment):**

```json
{ "comment": "Good sector alignment — proceed to engagement" }
```

**Response:**

```json
{
  "message": "Match approved. Use engagement_proposal_id for chat, activities, and MOU via /api/proposals.",
  "match": {
    "id": 1,
    "status": "approved",
    "engagement_proposal_id": 15
  },
  "engagement_proposal_id": 15,
  "party_b": {
    "linked": true,
    "account_created": true,
    "email_sent": true
  }
}
```

---

### 2. Reject match

```
PATCH /api/matchmaking/matches/:id/reject
```

**Comment required:**

```json
{ "comment": "Chinese partner scope does not fit sector priorities" }
```

---

### 3. After approve — use shared engagement APIs

| Feature | API |
|---------|-----|
| Chat history | `GET /api/proposals/:engagement_proposal_id/messages` |
| Socket chat | Step 10 — join room with `engagement_proposal_id` |
| Activities | `POST/GET /api/proposals/:engagement_proposal_id/activities` |
| Export | `GET /api/proposals/:engagement_proposal_id/export-report` |

Party A and Party B access engagement via **legacy** `/api/proposals/:id` (not matchmaking).

---

## Frontend UI

### Sector Lead — Match review detail

On `GET /api/matchmaking/matches/:id` when `status === 'pending_sl_review'`:

- **Approve** → `PATCH /api/matchmaking/matches/:id/approve`
- **Reject** → modal + required comment → `PATCH .../reject`

### After approve

Redirect to engagement UI:
```
/matchmaking/engagement/:engagement_proposal_id
```
or reuse existing proposal chat/activities screens with `engagement_proposal_id`.

Show success: Party B invite sent, chat now available.

---

## Postman test

```
# Login sector lead
POST /api/auth/login
{ "email": "sectorlead@test.com", "password": "password123" }

# Approve
PATCH /api/matchmaking/matches/1/approve
{ "comment": "Approved for engagement" }

# Chat (after approve)
GET /api/proposals/15/messages
```

---

## Errors

| Code | Message |
|------|---------|
| 400 | Comment required when rejecting |
| 400 | Only pending matches can be approved |
| 403 | Wrong sector |
| 404 | Match not found |

---

**Next step (12H):** MOU upload / tracking at end of engagement pipeline.

# Step 12I — Matchmaking: China RFP — Pakistan Filters + Matched Engagements

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

> China Regional FOP (RFP) can now:
> 1. See **all forwarded Pakistan proposals** with status / match filters (not only `forwarded_to_china`)
> 2. See **approved matched engagements** they created — same visibility pattern as Party A / Party B / Sector Lead

---

## No new migration

Uses existing tables: `mm_pakistan_proposals`, `mm_matches`, `mm_china_proposals`, `proposals`

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| China RFP | `rfp@test.com` | `password123` |
| Sector Lead | `sectorlead@test.com` | `password123` |

---

## APIs

### 1. Pakistan proposals — forwarded to you (updated)

```
GET /api/matchmaking/rfp/pakistan
GET /api/matchmaking/rfp/pakistan?status=forwarded_to_china
GET /api/matchmaking/rfp/pakistan?status=matched
GET /api/matchmaking/rfp/pakistan?sector=Agri-chemicals%20%26%20Inputs
GET /api/matchmaking/rfp/pakistan?match_status=none
GET /api/matchmaking/rfp/pakistan?match_status=pending_sl_review
```

**Role:** `regional_focal_point` only

**Returns proposals where:**
- `forwarded_to_rfp` = logged-in RFP user id
- `status` IN (`forwarded_to_china`, `matched`) — unless `?status=` filter applied

**Query filters:**

| Param | Values | Meaning |
|-------|--------|---------|
| `status` | `forwarded_to_china`, `matched` | PK proposal pipeline status |
| `sector` | any sector string | Same as before |
| `match_status` | `none`, `created`, `pending_sl_review`, `approved`, `rejected` | Latest match on that PK proposal |

**Response shape (updated — object, not bare array):**

```json
{
  "proposals": [
    {
      "id": 4,
      "venture_name": "E2E Test PK Proposal",
      "sector": "Agri-chemicals & Inputs",
      "status": "forwarded_to_china",
      "party_a_name": "Party A Test User",
      "forwarded_at": "2026-06-09T10:00:00.000Z",
      "active_match_id": 1,
      "active_match_status": "pending_sl_review",
      "active_china_proposal_id": 2,
      "engagement_proposal_id": null
    }
  ],
  "count": 1,
  "filters": {
    "status": "all",
    "sector": null,
    "match_status": null
  }
}
```

**PK status meanings for RFP:**

| `status` | When |
|----------|------|
| `forwarded_to_china` | Forwarded by SL — ready to match / in review |
| `matched` | Sector Lead approved match — engagement created |

**Detail (read-only):**

```
GET /api/matchmaking/pakistan/:id
```

RFP can view if forwarded to them and status is `forwarded_to_china` **or** `matched`.

---

### 2. Matched engagements — RFP dashboard (NEW)

```
GET /api/matchmaking/rfp/engagements
GET /api/matchmaking/rfp/engagements?sector=Agri-chemicals%20%26%20Inputs
GET /api/matchmaking/rfp/engagements?mou_status=not_started
```

**Role:** `regional_focal_point` only

Returns **approved** matches created by this RFP where `engagement_proposal_id` exists.

**Query filters:**

| Param | Values |
|-------|--------|
| `sector` | sector string |
| `mou_status` | `not_started`, `in_progress`, `uploaded`, `signed` |

**Example response:**

```json
{
  "engagements": [
    {
      "match_id": 1,
      "engagement_proposal_id": 42,
      "sector": "Agri-chemicals & Inputs",
      "mou_status": "not_started",
      "mou_uploaded_at": null,
      "pk_proposal_id": 4,
      "china_proposal_id": 2,
      "pk_status": "matched",
      "pk_venture_name": "E2E Test PK Proposal",
      "pk_company_name": "GreenTech Pakistan",
      "party_a_name": "Party A Test User",
      "party_a_email": "partya@test.com",
      "cn_venture_name": "CN Matchmaking — SinoAgri Tech JV",
      "cn_company_name": "SinoAgri Corp",
      "cn_party_b_name": "Li Wei",
      "cn_party_b_email": "agentaaugmenteck@yopmail.com",
      "cn_party_b_organization": "SinoAgri Corp",
      "engagement_status": "approved",
      "engagement_title": "E2E Test PK Proposal",
      "sl_reviewed_at": "2026-06-09T12:00:00.000Z",
      "sl_comment": "Approved for engagement"
    }
  ],
  "count": 1,
  "filters": {
    "sector": null,
    "mou_status": null
  }
}
```

**Match detail (existing):**

```
GET /api/matchmaking/rfp/matches/:id
```

**Engagement detail / chat / activities (shared — after approve):**

```
GET  /api/proposals/:engagement_proposal_id
GET  /api/proposals/:engagement_proposal_id/messages
GET  /api/proposals/:engagement_proposal_id/activities
```

**Role:** `regional_focal_point` — **read-only** on shared APIs when this RFP created the approved match (`mm_matches.proposed_by_rfp` + `engagement_proposal_id`).

- `GET /api/proposals/:id` — allowed
- `GET /api/proposals/:id/activities` — allowed
- `GET /api/proposals/:id/messages` — allowed (`canSend: false` in response)
- Socket chat join — allowed, read-only (`canSend: false` on `chat:joined`)
- `POST` activities / send chat — **403** for RFP

**MOU (matchmaking — read-only for RFP):**

```
GET   /api/matchmaking/matches/:match_id/mou
```

Use **`match_id`** from engagements list (e.g. `2`) — not `engagement_proposal_id`.

**Engagement → match lookup:**

```
GET /api/matchmaking/engagement/:engagement_proposal_id/match
```

Use **`engagement_proposal_id`** (e.g. `35`) — not `match_id`.

| ID | Example | Used in |
|----|---------|---------|
| `match_id` | `2` | `/matches/2/mou`, `/rfp/matches/2` |
| `engagement_proposal_id` | `35` | `/api/proposals/35`, `/engagement/35/match` |

> RFP: `GET` MOU only. `PATCH` MOU → **403** (Party A / Party B / Sector Lead upload).

---

## Frontend UI — China RFP

### A) Pakistan Proposals page (`/matchmaking/rfp/pakistan`)

1. `GET /api/matchmaking/rfp/pakistan`
2. Parse **`response.proposals`** (not root array)
3. Filter tabs:
   - **All** — no `status` param
   - **Awaiting match** — `?status=forwarded_to_china&match_status=none`
   - **In review** — `?match_status=pending_sl_review`
   - **Matched** — `?status=matched` or `?match_status=approved`
4. Sector dropdown → `?sector=...`
5. Table columns: title, sector, PK status, match status badge, Party A, forwarded date
6. Row actions: View detail, Create match (if no active match), View match

### B) Engagements page (`/matchmaking/rfp/engagements`) — NEW sidebar item

1. `GET /api/matchmaking/rfp/engagements`
2. Show cards/table: PK venture + China venture, Party A, Party B, MOU status
3. Filters: sector, MOU status
4. Actions per row:
   - **Open engagement** → `/proposals/:engagement_proposal_id` (chat + activities)
   - **View MOU** → `/matchmaking/matches/:match_id/mou` (read-only for RFP)

### C) Proposal detail — **Chat tab for RFP (frontend fix)**

Backend chat **works** for RFP. Frontend must **show Chat tab** — do not hide it for `regional_focal_point`.

**Show Chat tab when** any of:
- `GET /api/proposals/:id` → `capabilities.can_view_chat === true`
- `GET /api/matchmaking/rfp/engagements` → `can_view_chat === true`

**Proposal detail tabs for RFP:**

| Tab | Show? |
|-----|-------|
| Details | Yes |
| Chat | **Yes** (read-only) |
| MOU | Yes (read-only) |
| Activities | Yes (read-only) |

**Chat integration:**

```
GET  /api/proposals/:engagement_proposal_id/messages   → history, canSend: false
Socket chat:join { proposalId }                       → canSend: false on chat:joined
```

- Hide message input when `canSend === false`
- Show banner: "Read-only — you can view messages but not send"
- Do **not** gate Chat tab on role `party_a|party_b|sector_lead` only

### C) Sidebar suggestion

```
CHINA MATCHMAKING
  ├── Pakistan Proposals      → /matchmaking/rfp/pakistan
  ├── China Proposals         → /matchmaking/rfp/china
  ├── Upload China Proposal
  ├── Matches                 → /matchmaking/rfp/matches
  └── Engagements (NEW)       → /matchmaking/rfp/engagements
```

---

## Breaking change for frontend

`GET /api/matchmaking/rfp/pakistan` response changed from **array** to:

```json
{ "proposals": [...], "count": N, "filters": {...} }
```

Update frontend to use `data.proposals` instead of `data` directly.

---

## Postman quick test

```bash
# Login RFP
POST /api/auth/login
{ "email": "rfp@test.com", "password": "password123" }

# All forwarded PK proposals
GET /api/matchmaking/rfp/pakistan

# Only awaiting match
GET /api/matchmaking/rfp/pakistan?status=forwarded_to_china&match_status=none

# Approved engagements
GET /api/matchmaking/rfp/engagements
```

---

## Troubleshooting — empty Pakistan list

If `count: 0` but Sector Lead forwarded:

1. Confirm SL forwarded to **this** RFP user (`regional_focal_point_id` = logged-in user id)
2. UI user "Regional Focal Point — Punjab" must match `rfp@test.com` (id 5 in seed)
3. Re-forward from Sector Lead if wrong RFP was selected

---

## Role visibility summary

| Role | Pakistan MM | China MM | Matches | Engagements |
|------|-------------|----------|---------|-------------|
| Party A | own proposals | — | — | via `/api/proposals` after approve |
| Sector Lead | sector queue | — | pending review | via `/api/proposals` |
| China RFP | `/rfp/pakistan` | `/rfp/china` | `/rfp/matches` | **`/rfp/engagements`** |
| Party B | — | — | — | via `/api/proposals` |
| Super Admin | all | all | all | all |

# Super Admin — Matchmaking Proposal Create (Frontend Guide)

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

Super Admin can now **create, edit, submit, and upload** for:

- **Pakistan Matchmaking** proposals (on behalf of Party A)
- **China Investor** proposals (on behalf of Chinese investor)

---

## Rules

| Rule | Detail |
|------|--------|
| PK create | SA must pass `party_a_id` on **first** `POST /pakistan/draft` |
| China create | SA must pass `investor_id` on **first** `POST /china/draft` |
| Ownership | Proposal is stored under the selected user (`party_a_id` / `submitted_by_investor`) |
| Edit/submit | SA can edit/submit **any** draft by `proposal_id` (no re-send owner id) |
| Upload | Same multipart endpoints — no owner id needed |
| My list | SA sees **all** proposals; optional `?party_a_id=` or `?investor_id=` filter |

---

## User picker APIs (Super Admin)

Load dropdown options before create form:

```
GET /api/users?role=party_a
GET /api/users?role=chinese_investor
```

**Role:** `super_admin`

---

## Pakistan — Super Admin create flow

### 1. First save (new draft)

```
POST /api/matchmaking/pakistan/draft
```

```json
{
  "party_a_id": 2,
  "engagement_type": "B2B",
  "sector": "Agri-chemicals & Inputs",
  "venture_name": "Test PK Venture",
  "company_name": "GreenTech Pakistan",
  "party_a_info": { ... },
  "conference_info": { ... }
}
```

**Required for SA:** `party_a_id` — must be an existing `party_a` user.

**Response `201`:**

```json
{
  "proposal_id": 15,
  "status": "draft",
  "party_a_id": 2,
  "created_on_behalf_of": "Party A — Ali Khan",
  "created_on_behalf_of_email": "partya@test.com"
}
```

### 2. Continue editing

```
POST /api/matchmaking/pakistan/draft
{ "proposal_id": 15, "venture_name": "Updated name", ... }
```

No `party_a_id` needed on updates.

### 3. Upload files

```
POST /api/matchmaking/pakistan/upload
```

Multipart: `proposal_file`, `company_logo`, `cover_image`

### 4. Submit

```
POST /api/matchmaking/pakistan/submit
{ "proposal_id": 15 }
```

### 5. List (SA)

```
GET /api/matchmaking/pakistan/my
GET /api/matchmaking/pakistan/my?party_a_id=2
GET /api/matchmaking/pakistan/my?status=draft
```

Returns all PK proposals for SA (includes drafts).

---

## China — Super Admin create flow

### 1. First save (new draft)

```
POST /api/matchmaking/china/draft
```

```json
{
  "investor_id": 7,
  "engagement_type": "B2B",
  "sector": "Agri-chemicals & Inputs",
  "venture_name": "SinoAgri Tech JV",
  "company_name": "SinoAgri Corp",
  "party_b_name": "Li Wei",
  "party_b_email": "investor@test.com"
}
```

**Required for SA:** `investor_id` (alias: `submitted_by_investor`) — existing `chinese_investor` user.

**Response `201`:**

```json
{
  "china_proposal_id": 8,
  "status": "draft",
  "investor_id": 7,
  "created_on_behalf_of": "Li Wei — SinoAgri",
  "created_on_behalf_of_email": "investor@test.com"
}
```

### 2–4. Edit / upload / submit

Same pattern as Pakistan — use `china_proposal_id` / `proposal_id`.

```
POST /api/matchmaking/china/draft
POST /api/matchmaking/china/upload
POST /api/matchmaking/china/submit
{ "proposal_id": 8 }
```

### 5. List (SA)

```
GET /api/matchmaking/china/my
GET /api/matchmaking/china/my?investor_id=7
```

---

## Role matrix (updated)

| API | Party A | Chinese Investor | Super Admin |
|-----|---------|------------------|-------------|
| `POST /pakistan/draft` | ✅ | ❌ | ✅ + `party_a_id` |
| `POST /pakistan/submit` | ✅ | ❌ | ✅ |
| `POST /pakistan/upload` | ✅ | ❌ | ✅ |
| `GET /pakistan/my` | own only | ❌ | all (+ filter) |
| `POST /china/draft` | ❌ | ✅ | ✅ + `investor_id` |
| `POST /china/submit` | ❌ | ✅ | ✅ |
| `POST /china/upload` | ❌ | ✅ | ✅ |
| `GET /china/my` | ❌ | own only | all (+ filter) |

---

## Frontend UI — Super Admin

### Pakistan wizard (`/matchmaking/pakistan/new`)

1. **Step 0 (SA only):** dropdown — “Create on behalf of Party A”
   - Fetch `GET /api/users?role=party_a`
   - Store selected `party_a_id`
2. First `POST /draft` must include `party_a_id`
3. Show banner: *Creating as Super Admin on behalf of [name]*
4. Rest of wizard same as Party A flow

### China wizard (`/matchmaking/china/new` or SA route)

1. **Step 0 (SA only):** dropdown — “Create on behalf of Chinese Investor”
   - Fetch `GET /api/users?role=chinese_investor`
2. First `POST /china/draft` must include `investor_id`

### Errors

| Status | Message |
|--------|---------|
| `400` | `party_a_id is required when Super Admin creates a Pakistan proposal` |
| `400` | `investor_id is required when Super Admin creates a China proposal` |
| `400` | `party_a_id must reference an existing Party A user` |

---

## Test

```bash
# Login SA → get token
# PK draft
curl -X POST http://localhost:5000/api/matchmaking/pakistan/draft \
  -H "Authorization: Bearer <SA_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"party_a_id":2,"sector":"Agri-chemicals & Inputs","venture_name":"SA Test PK"}'

# China draft
curl -X POST http://localhost:5000/api/matchmaking/china/draft \
  -H "Authorization: Bearer <SA_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"investor_id":7,"sector":"Agri-chemicals & Inputs","venture_name":"SA Test CN"}'
```

---

## Frontend implementation prompt

```
Enable Super Admin to create Pakistan and China matchmaking proposals.

Backend doc: MM_PK_PROPOSAL_ROLE_ACCESS.md (updated)

## Backend now allows super_admin on:
- POST /api/matchmaking/pakistan/draft|submit|upload
- GET  /api/matchmaking/pakistan/my
- POST /api/matchmaking/china/draft|submit|upload
- GET  /api/matchmaking/china/my

## SA must pass on FIRST draft only:
- Pakistan: party_a_id (from GET /api/users?role=party_a)
- China: investor_id (from GET /api/users?role=chinese_investor)

## UI tasks
1. Show "New Proposal (PK)" and "New China Proposal" for super_admin in sidebar
2. Add owner picker step/dropdown before wizard for SA
3. Include party_a_id / investor_id in first POST /draft body only
4. Banner: "Creating on behalf of [user name]"
5. GET /pakistan/my and /china/my for SA lists all — use for SA draft resume

Do not block SA from /matchmaking/pakistan/new anymore.
```

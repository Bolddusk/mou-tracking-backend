# Step 14 — System Modules + Super Admin Full Access (Frontend Guide)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`  
**Super Admin login:** `superadmin@test.com` / `password123`

> Super Admin ko system ki **saari cheezen dikhani hain** — kam az kam **read-only view** har module ka.  
> Abhi kuch matchmaking V2 screens Sector Lead APIs use karti hain → Super Admin ko **403** milta hai. Neeche **Required** vs **Ready** alag likha hai.

---

## Total modules — 7 areas, 28 functions

| # | Area | Functions |
|---|------|-----------|
| 1 | **Direct Opportunities** (legacy) | 6 |
| 2 | **Matchmaking V2 — Pakistan** | 4 |
| 3 | **Matchmaking V2 — China** | 5 |
| 4 | **Matchmaking V2 — Matching** | 4 |
| 5 | **Post-Match Engagement** | 5 |
| 6 | **Complaints** | 3 |
| 7 | **Admin & Account** | 3 |

---

## Module map (har role + Super Admin access)

Legend:
- ✅ = Backend ready for Super Admin **today**
- 👁 = Super Admin **read-only** (dikhao, action buttons hide)
- ⚠️ = Backend **not ready** — SA ko 403; backend extend karna hai ya impersonation
- ❌ = Super Admin ko action nahi (sirf dekh sakta hai jab ⚠️ fix ho)

---

### 1. Direct Opportunities (Legacy `/api/proposals`)

| # | Function | Primary role | Super Admin | API | SA access today |
|---|----------|--------------|-------------|-----|-----------------|
| 1.1 | Submit proposal | Party A | 👁 view all | `POST /draft`, `POST /submit` | ❌ submit — use **1.2** list |
| 1.2 | **All opportunities list** | Super Admin | ✅ | `GET /api/proposals/all` | ✅ |
| 1.3 | Proposal detail | Party A, SL, SA | ✅ | `GET /api/proposals/:id` | ✅ |
| 1.4 | Approve / reject (legacy) | Sector Lead | 👁 optional | `PATCH /:id/approve`, `reject` | ✅ (SA allowed) |
| 1.5 | Chat | Party A/B, SL, SA | ✅ | `GET /:id/messages` + Socket | ✅ |
| 1.6 | Activities + poke | Party A, SL, SA | ✅ | `GET/POST /:id/activities`, `POST /poke` | ✅ |
| 1.7 | Export report | SL, SA | ✅ | `GET /:id/export-report` | ✅ |

**SA sidebar:** `Direct Opportunities → Dashboard` → `GET /api/proposals/all`

---

### 2. Matchmaking V2 — Pakistan side

| # | Function | Primary role | Super Admin | API | SA access today |
|---|----------|--------------|-------------|-----|-----------------|
| 2.1 | Submit PK proposal | Party A | 👁 | `POST /matchmaking/pakistan/submit` | ❌ |
| 2.2 | My PK proposals | Party A | 👁 | `GET /matchmaking/pakistan/my` | ❌ |
| 2.3 | **PK queue (all sectors)** | Sector Lead | ✅ | `GET /matchmaking/pakistan/sector-lead` | ✅ (all statuses, all sectors) |
| 2.4 | Shortlist / reject PK | Sector Lead | 👁 | `PATCH /pakistan/:id/shortlist`, `reject` | ✅ (hide buttons for SA = read-only UI) |
| 2.5 | PK proposal detail | SL, SA, Party A | ✅ | `GET /matchmaking/pakistan/:id` | ✅ |

**SA sidebar:** `Matchmaking → Pakistan Proposals` → **2.3** (not Party A submit)

---

### 3. Matchmaking V2 — China side

| # | Function | Primary role | Super Admin | API | SA access today |
|---|----------|--------------|-------------|-----|-----------------|
| 3.1 | Submit China proposal | Chinese Investor | 👁 | `POST /matchmaking/china/submit` | ❌ |
| 3.2 | Investor my list | Chinese Investor | 👁 | `GET /matchmaking/china/my` | ❌ |
| 3.3 | **China FOP queue (all)** | China FOP, SA | ✅ | `GET /matchmaking/fop/china` | ✅ SA allowed |
| 3.4 | FOP shortlist / reject | China FOP | 👁 | `PATCH /fop/china/:id/shortlist`, `reject` | ⚠️ **403** |
| 3.5 | FOP forward to PK SL | China FOP | 👁 | `GET forward-options`, `PATCH forward-pakistan` | ⚠️ **403** |
| 3.6 | **China inbox (forwarded to SL)** | Sector Lead, SA | ✅ | `GET /matchmaking/china/sector-lead` | ✅ SA sees **all** sectors |
| 3.7 | China proposal detail | FOP, SL | ⚠️ | `GET /fop/china/:id` | ⚠️ **403** |

**SA sidebar (required):**
- `Matchmaking → China Proposals (All)` → needs **3.3** backend for SA
- `Matchmaking → China Forwarded to SL` → needs **3.6** backend for SA

---

### 4. Matchmaking V2 — Matching

| # | Function | Primary role | Super Admin | API | SA access today |
|---|----------|--------------|-------------|-----|-----------------|
| 4.1 | **Create match** | Sector Lead, SA | ✅ | `POST /matchmaking/sector-lead/matches` | ✅ SA can create (any sector pair) |
| 4.2 | **SL matches list** | Sector Lead, SA | ✅ | `GET /matchmaking/sector-lead/matches` | ✅ SA sees **all** matches |
| 4.3 | Match detail | SL, FOP, SA | ✅ | `GET /matchmaking/matches/:id` | ✅ |
| 4.4 | Legacy V1 approve match | Sector Lead | 👁 deprecated | `GET pending-review`, `PATCH approve` | ✅ (V1 only) |

**SA sidebar:** `Matchmaking → All Matches` → needs **4.2** extended for SA (all matches, all sectors)

---

### 5. Post-Match Engagement (shared)

| # | Function | Primary role | Super Admin | API | SA access today |
|---|----------|--------------|-------------|-----|-----------------|
| 5.1 | Engagement detail | Party A/B, SL, SA | ✅ | `GET /api/proposals/:engagement_id` | ✅ |
| 5.2 | Chat | Party A/B, SL, SA | ✅ | `GET /:id/messages`, Socket | ✅ `canSend: true` |
| 5.3 | Activities | Party A, SL, SA | ✅ | `GET/POST /:id/activities` | ✅ |
| 5.4 | MOU view | Party A/B, SL, SA, FOP | ✅ | `GET /matchmaking/matches/:id/mou` | ✅ |
| 5.5 | MOU upload | Party A/B, SL | 👁 | `PATCH /matches/:id/mou` | ✅ (SA can upload today) |
| 5.6 | Match by engagement | SL, SA, Party A/B | ✅ | `GET /matchmaking/engagement/:id/match` | ✅ |

**Note:** Legacy dashboard `GET /proposals/all` mein V2 engagements bhi dikhte hain (approved rows). Alag **Engagement detail** page same `/proposals/:id`.

---

### 6. Complaints

| # | Function | Primary role | Super Admin | API | SA access today |
|---|----------|--------------|-------------|-----|-----------------|
| 6.1 | **All complaints** | Super Admin | ✅ | `GET /api/complaints/all` | ✅ |
| 6.2 | Complaint detail | All (scoped) | ✅ | `GET /api/complaints/:id` | ✅ |
| 6.3 | Approve / reject complaint | SL, SA, RFP | ✅ | `PATCH /:id/approve`, `reject` | ✅ |

**SA sidebar:** `Complaints` → **6.1**

---

### 7. Admin & Account

| # | Function | Primary role | Super Admin | API | SA access today |
|---|----------|--------------|-------------|-----|-----------------|
| 7.1 | **User management** | Super Admin | ✅ | `GET/POST/PATCH/DELETE /api/users` | ✅ |
| 7.2 | Sector leads dropdown | SL, FOP, SA | ✅ | `GET /api/users/sector-leads` | ✅ |
| 7.3 | Change password | All | ✅ | `PATCH /api/auth/change-password` | ✅ |
| 7.4 | Roles list | Super Admin | ✅ | `GET /api/users/roles` | ✅ |

**SA sidebar:** `Users` → **7.1**

---

## Super Admin sidebar — correct structure (frontend)

**Do NOT copy Sector Lead sidebar for Super Admin.**

```
SUPER ADMIN
├── Direct Opportunities
│   └── All Opportunities          → GET /api/proposals/all
│
├── Matchmaking (oversight)
│   ├── Pakistan Proposals (all)   → GET /matchmaking/pakistan/sector-lead  ✅
│   ├── China Proposals (all)      → GET /matchmaking/admin/china          ⚠️ backend TODO
│   ├── China FOP Queue (all)      → GET /matchmaking/admin/fop/china      ⚠️ backend TODO
│   ├── Forwarded China (all SL)   → GET /matchmaking/admin/china-forwarded ⚠️ backend TODO
│   └── All Matches                → GET /matchmaking/admin/matches        ⚠️ backend TODO
│
├── Complaints
│   └── All Complaints             → GET /api/complaints/all  ✅
│
└── Administration
    ├── Users                      → GET /api/users  ✅
    └── Change Password            → ✅
```

Until admin APIs exist, SA can use **✅ ready** items only; **⚠️** screens pe "Coming soon" ya hide karo — **403 mat dikhao**.

---

## Role sidebar quick reference (non–Super Admin)

| Role | Main modules |
|------|----------------|
| **party_a** | Direct submit, Matchmaking PK submit/my, Complaints my, Engagement |
| **chinese_investor** | China submit/my |
| **regional_focal_point** | China FOP queue, forward, (legacy RFP screens optional) |
| **sector_lead** | PK queue, China inbox, Create match, My matches, Legacy SL review, Complaints sector |
| **party_b** | Direct my, Engagement chat, Complaints assigned |
| **super_admin** | **Everything read** + Users + Complaints all + Legacy all proposals |

---

## Super Admin — API cheat sheet (works today)

```http
# Legacy
GET  /api/proposals/all
GET  /api/proposals/:id
GET  /api/proposals/:id/messages
GET  /api/proposals/:id/activities
GET  /api/proposals/:id/export-report?format=pdf

# Matchmaking (partial)
GET  /api/matchmaking/pakistan/sector-lead
GET  /api/matchmaking/pakistan/sector-lead?status=submitted
GET  /api/matchmaking/pakistan/:id
GET  /api/matchmaking/matches/:id
GET  /api/matchmaking/matches/:id/mou
GET  /api/matchmaking/engagement/:engagement_proposal_id/match

# Complaints
GET  /api/complaints/all
GET  /api/complaints/:id

# Users
GET  /api/users
GET  /api/users/roles
GET  /api/users/sector-leads
```

---

## Backend TODO (Super Admin full visibility)

Frontend in APIs ke baghair complete SA dashboard nahi bana sakta:

| Priority | New API | Purpose |
|----------|---------|---------|
| P1 | `GET /api/matchmaking/admin/china` | All China proposals (all statuses) |
| P1 | `GET /api/matchmaking/admin/matches` | All matches (all sectors) |
| P2 | `GET /api/matchmaking/admin/china-forwarded` | All forwarded-to-SL China proposals |
| P2 | `GET /api/matchmaking/admin/stats` | Counts: PK/China/matched by status |
| P3 | Allow `super_admin` on read-only `GET /fop/china`, `GET /china/sector-lead` | Quick fix without new routes |

Jab backend team ye add kare → SA sidebar ke ⚠️ items enable karo.

---

## Frontend rules for Super Admin UI

1. **Sidebar** — alag `SUPER_ADMIN_NAV` config; Sector Lead nav share mat karo.
2. **Read-only** — Matchmaking mein shortlist / forward / create match buttons **hide** (SA oversight only), jab tak product action allow na kare.
3. **403 handling** — agar API ⚠️ ho to empty state: "Admin view pending backend" — generic error mat dikhao.
4. **Two data sources** — Legacy `proposals` table ≠ `mm_pakistan_proposals` / `mm_china_proposals`. Labels clear rakho: "Direct Opportunity" vs "Matchmaking PK" vs "Engagement".
5. **Engagement link** — match row se `engagement_proposal_id` → `/proposals/:id`.
6. **User management** — create `chinese_investor`, `regional_focal_point`, `sector_lead` roles (`STEP5_USER_MANAGEMENT_API.md`).

---

## Test Super Admin (manual)

1. Login `superadmin@test.com`
2. `GET /api/proposals/all` → legacy list loads
3. `GET /api/matchmaking/pakistan/sector-lead` → PK matchmaking list loads
4. `GET /api/matchmaking/fop/china` → **403** (expected until admin API)
5. `GET /api/complaints/all` → loads
6. `GET /api/users` → loads

---

## Related docs

| Doc | Content |
|-----|---------|
| `STEP13_MATCHMAKING_V2_API.md` | V2 flow per role |
| `STEP5_USER_MANAGEMENT_API.md` | Users CRUD |
| `STEP4_COMPLAINTS_API.md` | Complaints |
| `STEP2_SECTOR_REVIEW_API.md` | Legacy proposals |
| `STEP10_PROPOSAL_SOCKET_CHAT_API.md` | Chat |

---

## Copy-paste frontend prompt (short)

> Build Super Admin nav from `STEP14_SUPER_ADMIN_MODULES.md`.  
> 7 areas, 28 functions. SA gets read-only oversight on all matchmaking + full access on Users, Complaints all, Proposals all.  
> Use ✅ APIs only; hide ⚠️ screens until `/api/matchmaking/admin/*` exists.  
> Do not reuse Sector Lead sidebar (China Inbox / Create Match will 403 for SA).

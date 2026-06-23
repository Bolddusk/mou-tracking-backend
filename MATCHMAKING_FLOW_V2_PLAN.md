# Matchmaking Flow V2 — Revised Plan

**Status:** Implemented — see **`STEP13_MATCHMAKING_V2_API.md`** for frontend integration  
**Replaces:** Steps 12B–12G direction (PK → China RFP → match → SL approve)

---

## Old vs New (summary)

| # | Old flow (built) | New flow (V2) |
|---|------------------|---------------|
| 1 | Party A submits PK proposal | Same — Party A submits PK proposal |
| 2 | PK Sector Lead shortlist → **forward to China FOP** | PK Sector Lead shortlist — **stays with SL** (no forward to China) |
| 3 | China **FOP uploads** China proposal | **Chinese investor** uploads own China proposal |
| 4 | China FOP views forwarded PK + creates match | China FOP **shortlists** China proposal → **forward to PK Sector Lead** (by sector) |
| 5 | China FOP sends match to SL for review | **PK Sector Lead** creates match (PK + China, same sector) |
| 6 | SL **approves** match → engagement | **No approval** — match = engagement (auto) |

---

## New flow diagram

```
PARTY A (Pakistan)                    CHINESE INVESTOR
      │                                       │
      ▼                                       ▼
  PK proposal                           China proposal
  (submitted)                           (submitted)
      │                                       │
      ▼                                       ▼
PAKISTAN SECTOR LEAD                  CHINA FOP (Regional Focal Point)
  shortlist PK                            shortlist China
  (no forward to China)                   forward to PK SL (by sector)
      │                                       │
      └──────────────┬────────────────────────┘
                     ▼
           PAKISTAN SECTOR LEAD
             creates MATCH
           (PK + China, same sector)
                     │
                     ▼
              NO APPROVAL STEP
           engagement auto-created
                     │
                     ▼
         Chat + Activities + MOU
         (shared /api/proposals)
```

---

## Roles (V2)

| Role | New responsibility |
|------|-------------------|
| **Party A** | Submit PK matchmaking proposals (unchanged) |
| **Chinese Investor** | Submit own China-side proposal (new role or `party_b`-like China submitter) |
| **China FOP** | Review China proposals → shortlist → forward to **PK Sector Lead** by sector |
| **Pakistan Sector Lead** | Shortlist PK proposals; receive forwarded China proposals; **create matches**; no approve step |
| **Party B** | Provisioned from China proposal contact after match (unchanged idea) |
| **Super Admin** | Oversight (unchanged) |

**Removed from China FOP:** upload China on behalf of investor, view forwarded PK list, create match, submit for SL review.

---

## Step-by-step (implementation order)

### Phase A — China side (investor → China FOP → PK SL)

#### **V2-1 — Chinese investor submits proposal**
- New submitter: Chinese investor (not China FOP)
- Table: `mm_china_proposals` (reuse or add `submitted_by_investor`)
- Status: `submitted`
- APIs (planned):
  - `POST /api/matchmaking/china/submit` — investor
  - `GET /api/matchmaking/china/my` — investor own list

#### **V2-2 — China FOP: China proposal queue**
- China FOP sees proposals in their queue (by sector / region — TBD)
- Status filter: `submitted`, `shortlisted`, `forwarded_to_pakistan`
- APIs (planned):
  - `GET /api/matchmaking/rfp/china/sector-lead` — submitted China proposals for FOP review
  - `GET /api/matchmaking/rfp/china/:id` — detail

#### **V2-3 — China FOP: shortlist China proposal**
- Same pattern as PK SL shortlist today
- Status: `submitted` → `shortlisted`
- APIs (planned):
  - `PATCH /api/matchmaking/rfp/china/:id/shortlist`
  - `PATCH /api/matchmaking/rfp/china/:id/reject` (optional)

#### **V2-4 — China FOP: forward to Pakistan Sector Lead**
- Forward shortlisted China proposal to PK SL **by sector** (sector on proposal must match SL sector)
- Status: `shortlisted` → `forwarded_to_pakistan`
- Store: `forwarded_to_sl`, `forwarded_at`
- APIs (planned):
  - `GET /api/users/sector-leads?sector=...` — pick SL (or auto by sector)
  - `PATCH /api/matchmaking/rfp/china/:id/forward-pakistan`
  - Body: `{ "sector_lead_id": <id> }` or auto-match by `proposal.sector`

---

### Phase B — Pakistan side (Party A → PK SL)

#### **V2-5 — Party A PK proposal (keep)**
- Already built: `POST/GET /api/matchmaking/pakistan/*`
- Status: `submitted` after submit

#### **V2-6 — PK Sector Lead: shortlist PK (simplify)**
- Keep: shortlist / reject submitted PK proposals
- **Remove:** forward to China FOP (`forward-china` deprecated in V2)
- Status: `submitted` → `shortlisted` (stays in SL pool for matching)
- APIs: keep `shortlist`, `reject`; deprecate `forward-china`

---

### Phase C — Matching (PK SL only, no approval)

#### **V2-7 — PK Sector Lead: view matchmaking pool**
- Two lists (or one combined UI):
  1. **PK proposals** ready to match: `shortlisted` (same sector as SL)
  2. **China proposals** forwarded to this SL: `forwarded_to_pakistan`
- APIs (planned):
  - `GET /api/matchmaking/pakistan/sector-lead?status=shortlisted` (exists)
  - `GET /api/matchmaking/china/sector-lead` — forwarded China proposals for this SL

#### **V2-8 — PK Sector Lead: create match**
- SL picks PK proposal + China proposal (**same sector**)
- Rules:
  - PK: `shortlisted`, SL sector match
  - China: `forwarded_to_pakistan`, `forwarded_to_sl` = this SL
  - No duplicate active match per PK or China pair
- Status: match `approved` **immediately** (skip `created` / `pending_sl_review`)
- **Auto:** create `engagement_proposal_id` in `proposals` + provision Party B (reuse 12G logic without review step)
- PK status → `matched`; China status → `matched`
- APIs (planned):
  - `POST /api/matchmaking/sector-lead/matches`
  - Body: `{ "pk_proposal_id", "china_proposal_id" }`
  - `GET /api/matchmaking/sector-lead/matches`

#### **V2-9 — Remove approval workflow**
- Deprecate / remove:
  - `PATCH /api/matchmaking/rfp/matches/:id/submit-review`
  - `GET /api/matchmaking/matches/pending-review`
  - `PATCH /api/matchmaking/matches/:id/approve`
  - `PATCH /api/matchmaking/matches/:id/reject`
- Match statuses simplify to: `approved` (on create) or `rejected` only if SL undo (optional future)

---

### Phase D — Post-match (mostly keep)

#### **V2-10 — Engagement: chat, activities**
- Reuse `/api/proposals/:engagement_proposal_id/*`
- Access rules: update for new flow (China FOP may only track, not chat — TBD)

#### **V2-11 — MOU**
- Reuse Step 12H match MOU APIs
- Party A / Party B / PK Sector Lead upload (TBD if China FOP read-only)

---

## DB changes (planned)

| Table | Change |
|-------|--------|
| `mm_china_proposals` | Add `submitted_by` (investor user id); change `uploaded_by_rfp` → optional; add `shortlisted_by`, `forwarded_to_sl`, `forwarded_at`; statuses: `submitted`, `shortlisted`, `rejected`, `forwarded_to_pakistan`, `matched` |
| `mm_pakistan_proposals` | Deprecate `forwarded_to_rfp`; keep `shortlisted` for matching pool |
| `mm_matches` | `proposed_by_rfp` → `created_by_sl`; remove `pending_sl_review`, `submitted_for_review_at`, `sl_reviewed_by` (or keep sl as creator); create engagement on INSERT |
| `users` | New role or use existing: `chinese_investor` / `party_b` for China submit — **decide with product** |

---

## Status enums (V2)

**PK (`mm_pakistan_proposals`):**
`draft` → `submitted` → `shortlisted` | `rejected` → `matched`

**China (`mm_china_proposals`):**
`draft` → `submitted` → `shortlisted` | `rejected` → `forwarded_to_pakistan` → `matched`

**Match (`mm_matches`):**
`approved` (on create) — optional `cancelled` later

---

## What to deprecate from V1

| V1 feature | V2 |
|------------|-----|
| SL `forward-china` | Remove |
| RFP `GET /rfp/pakistan` forwarded PK | Remove or read-only archive |
| RFP `POST /rfp/china` upload | Move to investor submit |
| RFP `POST /rfp/matches` | Move to SL `POST /sector-lead/matches` |
| RFP submit-review + SL approve | Remove — match instant |
| RFP engagements dashboard | PK SL engagements? or both — TBD |

---

## Open questions (confirm before build)

1. **Chinese investor role** — new `chinese_investor` user role or guest submit + email?
2. **PK proposal path** — SL must shortlist PK before match, or any `submitted` PK?
3. **China FOP scope** — all China proposals or filtered by FOP region/sector?
4. **Forward to SL** — auto by sector (one SL per sector) or manual pick?
5. **China FOP after forward** — read-only tracking only, or no access to engagement?
6. **Reject match** — any undo if SL picks wrong pair?

---

## Suggested build order (when you say go)

```
V2-1  Chinese investor submit API + migration
V2-2  China FOP queue + shortlist + forward to PK SL
V2-3  Deprecate PK forward-china + RFP match APIs
V2-4  PK SL China inbox (forwarded proposals)
V2-5  PK SL create match (instant engagement, no approval)
V2-6  Update seeds + E2E test doc
V2-7  Frontend integration docs (replace STEP12B–12G narrative)
```

---

## Test flow (V2 — manual)

1. Seed users: Party A, Chinese investor, China FOP, PK Sector Lead
2. Party A submit PK proposal (Agri-chemicals)
3. PK SL shortlist PK proposal
4. Chinese investor submit China proposal (same sector)
5. China FOP shortlist → forward to PK SL (Agri-chemicals)
6. PK SL open matchmaking → pick PK + China → create match
7. Verify `engagement_proposal_id` returned immediately
8. Party A + Party B chat; MOU

No step: forward PK to China, RFP upload, RFP match, SL approve.

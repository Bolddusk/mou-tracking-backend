# Matchmaking Flow — End-to-End Test Guide

**Base URL:** `http://localhost:5000`  
**Reset & seed:** `npm run db:seed:matchmaking-flow`

---

## One-time setup

```bash
npm run db:seed                              # users
npm run db:migrate:matchmaking-pakistan
npm run db:migrate:matchmaking-sector-lead
npm run db:migrate:matchmaking-forward-china
npm run db:migrate:matchmaking-china
npm run db:migrate:matchmaking-matches
npm run db:migrate:matchmaking-matched
npm run db:migrate:matchmaking-mou
npm run db:seed:matchmaking-flow             # fresh PK proposal (submitted)
```

---

## Logins

| Step | Role | Email | Password |
|------|------|-------|----------|
| 1 | Party A | `partya@test.com` | `password123` |
| 2–3, 8 | Sector Lead | `sectorlead@test.com` | `password123` |
| 4–7 | China RFP | `rfp@test.com` | `password123` |
| — | Super Admin | `superadmin@test.com` | `password123` |

**Sector:** `Agri-chemicals & Inputs` (Sector Lead + PK proposal)

Har request par: `Authorization: Bearer <token>`

---

## Flow diagram

```
Party A submit ──► SL shortlist ──► SL forward RFP ──► RFP view PK
       │                                                      │
       │                                              RFP upload China
       │                                                      │
       │                                              RFP create match
       │                                                      │
       │                                              RFP → SL review
       │                                                      │
       └──────────────────────────────────────────► SL approve match
                                                              │
                                         engagement_proposal_id
                                                              │
                                    Chat + Activities + MOU (shared APIs)
```

---

## Step-by-step APIs

### STEP 1 — Party A submit ✅ (seeded)

```
POST /api/auth/login  { "email": "partya@test.com", "password": "password123" }
GET  /api/matchmaking/pakistan/my
```

Status: `submitted`

---

### STEP 2 — Sector Lead shortlist

```
POST /api/auth/login  sectorlead@test.com
GET  /api/matchmaking/pakistan/sector-lead?status=submitted
PATCH /api/matchmaking/pakistan/:pk_id/shortlist
{ "comment": "Strong sector fit" }
```

Status: `shortlisted`

---

### STEP 3 — Forward to China RFP

```
GET  /api/users/regional-focal-points
PATCH /api/matchmaking/pakistan/:pk_id/forward-china
{ "regional_focal_point_id": <rfp_user_id> }
```

Status: `forwarded_to_china`

---

### STEP 4 — RFP view Pakistan proposals

```
POST /api/auth/login  rfp@test.com
GET  /api/matchmaking/rfp/pakistan
```

---

### STEP 5 — RFP upload China proposal

```
POST /api/matchmaking/rfp/china
```

Minimum body — same sector `Agri-chemicals & Inputs`:

```json
{
  "engagement_type": "B2B",
  "sector": "Agri-chemicals & Inputs",
  "company_name": "SinoAgri Corp",
  "venture_name": "SinoAgri Tech JV",
  "project_type": "Brownfield",
  "party_b_entity_type": "business",
  "party_b_name": "Li Wei",
  "party_b_organization": "SinoAgri Corp",
  "party_b_email": "agentaaugmenteck@yopmail.com",
  "party_b_phone": "+86-138-0000-5678",
  "party_b_country": "China",
  "executive_summary": {
    "company_overview": "Chinese agri-tech manufacturer.",
    "project_overview": "Blending technology for Pakistan JV.",
    "project_segment": "Agri-chemicals & Inputs",
    "sector_alignment": "Same sector as PK proposal.",
    "investment_ask_summary": "USD 3.8M equipment package"
  },
  "company_overview": {
    "years_in_operation": "18",
    "key_certifications": "ISO 9001",
    "infrastructure_assets": "3 plants",
    "value_chain_scope": "Blending to export"
  },
  "project_overview": {
    "core_activity": "Agri-input blending tech",
    "site_location": "Jiangsu, China",
    "target_production_capacity": "6500 MT"
  },
  "financials": {
    "years": [{ "label": "FY 2024", "metrics": { "total_revenue": "1200", "ebitda": "210", "net_income": "95", "total_assets": "1500", "total_debt": "280", "shareholder_equity": "720", "gross_profit_margin": "28", "ebitda_margin": "18", "return_on_equity": "13", "current_ratio": "1.5", "debt_to_equity": "0.39" } }],
    "additional_rows": []
  },
  "investment_ask": {
    "total_project_cost_usd": "4800000",
    "investment_ask_equity_usd": "3800000",
    "fund_utilization_technology_pct": "55",
    "fund_utilization_infrastructure_pct": "25",
    "fund_utilization_working_capital_pct": "20"
  },
  "contact_info": {
    "name": "Li Wei",
    "email": "liwei@china-agri.cn",
    "cell": "+86-138-0000-5678"
  }
}
```

Save `china_proposal_id` from response.

---

### STEP 6 — RFP create match

```
POST /api/matchmaking/rfp/matches
{
  "pk_proposal_id": <pk_id>,
  "china_proposal_id": <cn_id>
}
```

Status: `created` — save `match_id`

---

### STEP 7 — RFP send to Sector Lead

```
PATCH /api/matchmaking/rfp/matches/:match_id/submit-review
```

Status: `pending_sl_review`

---

### STEP 8 — Sector Lead approve match

```
POST /api/auth/login  sectorlead@test.com
GET  /api/matchmaking/matches/pending-review
PATCH /api/matchmaking/matches/:match_id/approve
{ "comment": "Approved for engagement" }
```

Response: **`engagement_proposal_id`** — save this!

Party B invite → `agentaaugmenteck@yopmail.com`

---

### STEP 9 — Chat (shared)

```
GET /api/proposals/:engagement_proposal_id/messages
```

Socket: join room with `engagement_proposal_id` (Step 10 doc)

---

### STEP 10 — Activities (shared)

```
GET  /api/proposals/:engagement_proposal_id/activities
POST /api/proposals/:engagement_proposal_id/activities
```

---

### STEP 11 — MOU

```
GET   /api/matchmaking/matches/:match_id/mou
PATCH /api/matchmaking/matches/:match_id/mou
```

Multipart: `mou_file` + text fields. Set `mou_status: "signed"` when done.

---

## API namespace cheat sheet

| Phase | Base path |
|-------|-----------|
| Matchmaking pipeline | `/api/matchmaking/*` |
| Chat, activities, export | `/api/proposals/:engagement_id/*` |
| Legacy direct flow | `/api/proposals` (untouched) |

---

## Reset for re-test

```bash
npm run db:seed:matchmaking-flow
```

Clears all matchmaking data + creates fresh submitted PK proposal.

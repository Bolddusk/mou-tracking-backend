# Step 12D — Matchmaking: China RFP Uploads Chinese Proposal

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

> China Regional FOP uploads Chinese-side proposals with sector + Party B (Chinese company) details.  
> **No MOU. No Pakistan Party A info.**

---

## Migration (run once)

```bash
npm run db:migrate:matchmaking-china
```

Optional seed:

```bash
npm run db:seed:matchmaking-china
```

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| China RFP | `rfp@test.com` | `password123` |

---

## APIs

### 1. Upload file (before create)

```
POST /api/matchmaking/rfp/upload
```

Multipart: `proposal_file`, `company_logo`, or `cover_image`

Returns `{ file_url, field }` — use URL in create body.

---

### 2. Create China proposal

```
POST /api/matchmaking/rfp/china
```

**Role:** `regional_focal_point`

**Body example:**

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
  "party_b_email": "liwei@china-agri.cn",
  "party_b_phone": "+86-138-0000-5678",
  "party_b_country": "China",
  "proposal_file_url": "http://localhost:5000/uploads/....pdf",
  "executive_summary": {
    "company_overview": "...",
    "project_overview": "...",
    "project_segment": "...",
    "sector_alignment": "...",
    "investment_ask_summary": "..."
  },
  "company_overview": {
    "years_in_operation": "18",
    "key_certifications": "...",
    "infrastructure_assets": "...",
    "value_chain_scope": "..."
  },
  "project_overview": {
    "core_activity": "...",
    "site_location": "...",
    "target_production_capacity": "..."
  },
  "financials": {
    "years": [{ "label": "FY 2024", "metrics": { ... } }],
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
    "designation": "Director",
    "email": "liwei@china-agri.cn",
    "cell": "+86-138-0000-5678"
  }
}
```

**Response (201):**

```json
{
  "china_proposal_id": 1,
  "message": "China proposal uploaded successfully",
  "proposal": { "id": 1, "status": "active", "sector": "Agri-chemicals & Inputs", ... }
}
```

---

### 3. List my China proposals

```
GET /api/matchmaking/rfp/china
GET /api/matchmaking/rfp/china?sector=Agri-chemicals%20%26%20Inputs
```

---

### 4. China proposal detail

```
GET /api/matchmaking/rfp/china/:id
```

---

## Required vs not required

| Required | Not required |
|----------|--------------|
| Sector, company, venture, project template | `party_a_info` |
| Chinese Party B contact fields | MOU fields |
| Executive summary, financials, investment ask | Pakistan Party A data |
| Fund utilization = 100% | |

---

## Frontend UI

**Route:** `/matchmaking/rfp/china`

1. **Upload form** — same template sections as PK proposal but:
   - Label Party B fields as **Chinese Company / Contact**
   - Hide Party A section and MOU section
2. File upload → `POST /api/matchmaking/rfp/upload`
3. Submit → `POST /api/matchmaking/rfp/china`
4. **My China Proposals** list → `GET /api/matchmaking/rfp/china`
5. Detail → `GET /api/matchmaking/rfp/china/:id`

---

## Postman test

```
POST /api/auth/login
{ "email": "rfp@test.com", "password": "password123" }

POST /api/matchmaking/rfp/china
Authorization: Bearer <token>
{ ...body above... }

GET /api/matchmaking/rfp/china
```

---

**Next step (12E):** Match PK + China proposals (same sector) — `POST /api/matchmaking/rfp/matches`

# Step 8 — MNFSR Proposal Template (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>` (Party A for create/submit)

Replaces the old 3-step proposal (title + description) with the **Pak-China Agri-Investment pitch template** (7 slides + Party B/MOU).

---

## Setup (one time)

```bash
cd investment-portal-backend
npm run db:migrate:proposal-template
npm run dev
```

---

## Form flow (8 steps)

| Step | Section | Key fields |
|------|---------|------------|
| 1 | Cover | `company_name`, `company_logo_url`, `cover_image_url` |
| 2 | Executive Summary | `sector`, `project_type`, `executive_summary` |
| 3 | Company Overview | `company_overview` |
| 4 | Project Overview | `venture_name`, `project_overview` |
| 5 | Financials | `financials` (dynamic years) |
| 6 | Investment Ask | `investment_ask` |
| 7 | Contact + Pitch | `contact_info`, `proposal_file_url` (optional) |
| 8 | Party B & MOU | `party_b_*`, `mou_*` (required on submit) |

**Project type:** `Greenfield` | `Brownfield`

---

## APIs (unchanged routes, new payload)

### Save draft

**`POST /api/proposals/draft`**

```json
{
  "proposal_id": 12,
  "company_name": "GreenTech Pakistan",
  "company_logo_url": "http://localhost:5000/uploads/logo.png",
  "sector": "Food Processing & Value Addition",
  "project_type": "Greenfield",
  "venture_name": "High-Yield Rice Processing Hub",
  "executive_summary": {
    "company_overview": "...",
    "project_overview": "...",
    "project_segment": "...",
    "sector_alignment": "...",
    "investment_ask_summary": "USD 5M equity"
  },
  "company_overview": { "years_in_operation": "15", "...": "..." },
  "project_overview": { "core_activity": "...", "...": "..." },
  "financials": {
    "years": [
      { "label": "FY 2023", "metrics": { "total_revenue": "120", "ebitda": "30" } },
      { "label": "FY 2024", "metrics": { "total_revenue": "140", "ebitda": "35" } }
    ],
    "additional_rows": [
      { "category": "Capex", "label": "Plant expansion", "values": { "FY 2023": "50" } }
    ]
  },
  "investment_ask": {
    "total_project_cost_usd": "10000000",
    "fund_utilization_technology_pct": "40",
    "fund_utilization_infrastructure_pct": "40",
    "fund_utilization_working_capital_pct": "20"
  },
  "contact_info": {
    "name": "Ali Khan",
    "designation": "CEO",
    "email": "ali@company.com",
    "cell": "03001234567",
    "wechat": ""
  },
  "proposal_file_url": "http://localhost:5000/uploads/deck.pdf",
  "party_b_name": "Li Wei",
  "mou_file_url": "http://localhost:5000/uploads/mou.pdf"
}
```

Send partial fields on each step — draft merges updates.

### Submit

**`POST /api/proposals/submit`**

```json
{ "proposal_id": 12 }
```

Validates all required template fields + Party B + MOU.  
**Pitch deck (`proposal_file_url`) is optional.**

Fund utilization % must total **100**.

### Upload

**`POST /api/proposals/upload`** (multipart)

| Field | Use |
|-------|-----|
| `company_logo` | Step 1 logo |
| `cover_image` | Step 1 cover |
| `proposal_file` | Step 7 pitch deck (optional) |
| `mou_file` | Step 8 MOU (required on submit) |

Response:

```json
{ "file_url": "http://localhost:5000/uploads/...", "field": "company_logo" }
```

### Get detail

**`GET /api/proposals/:id`**

Returns parsed JSON sections + `display_title`:

```json
{
  "id": 12,
  "company_name": "GreenTech Pakistan",
  "venture_name": "Rice Processing Hub",
  "display_title": "Rice Processing Hub",
  "proposal_title": "Rice Processing Hub",
  "executive_summary": { "...": "..." },
  "financials": { "years": [ "..."] },
  "investment_ask": { "...": "..." },
  "contact_info": { "...": "..." }
}
```

`display_title` = `venture_name` → `company_name` → legacy `proposal_title`

---

## Required on submit

- All Step 1–7 template fields (except pitch deck & WeChat)
- All Party B + MOU fields (Step 8)
- At least one financial year with label
- Fund utilization % = 100

Missing fields returned as:

```json
{
  "error": "Missing required fields",
  "missing_fields": ["Company — Export Centricity", "Investment — Fund utilization must total 100%"]
}
```

---

## Financial metrics (fixed rows per year)

| Category | Metrics |
|----------|---------|
| Income Statement | Total Revenue, EBITDA, Net Income |
| Balance Sheet | Total Assets, Total Debt, Shareholder Equity |
| Profitability | Gross Profit Margin, EBITDA Margin |
| Liquidity & Risk | ROE, Current Ratio, Debt-to-Equity |

Users can **add fiscal years** and **custom additional rows** (e.g. Capex).

---

## Frontend files

| File | Purpose |
|------|---------|
| `src/constants/proposalTemplate.js` | Form defaults, steps, `getProposalDisplayTitle()` |
| `src/pages/proposals/NewProposal.jsx` | 8-step wizard |
| `src/components/proposal/FinancialsEditor.jsx` | Dynamic year table |
| `src/components/ProposalDetailPanel.jsx` | Reviewer detail view |

---

## Related docs

- `STEP2_SECTOR_REVIEW_API.md` — sector lead approve/reject
- `STEP5B_PARTY_B_API.md` — Party B after approval
- `FRONTEND_INTEGRATION.md` — legacy (superseded for proposal form)

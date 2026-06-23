# Matchmaking Proposal Form — Backend API & Frontend Integration Guide

**Backend base:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`  
**Updated:** June 2026

---

## Summary

Matchmaking proposals (`mm_proposals`) now use the **same business content** as Direct MOU proposals, but:

| Included | Excluded (until match) |
|----------|------------------------|
| Engagement & Conference | **Party B / counterparty** |
| **Your organization** (`submitter_info`) — not labeled Party A/B | **MOU section** |
| Cover, Executive Summary, Company, Project, Financials, Investment, Contact | |
| Proposal file upload | |

- **Side A** (`party_a`, Pakistan): full business validation  
- **Side B** (`investor`, China): lighter validation (same as legacy China flow)  
- **MOU** is uploaded **after match** on engagement `/proposals/{engagement_id}?tab=mou`  
- Rich fields are stored in `mm_proposals.keywords` JSON (nested objects)

---

## Form steps (frontend — 9 steps)

Reuse Direct MOU step UI from `NewProposal.jsx` / `constants/proposalTemplate.js`, **skip steps 3 and 11**:

| Step | Label | API field(s) |
|------|-------|----------------|
| 1 | Engagement & Conference | `side`, `country`, `sector`, `engagement_type`, `conference_info` |
| 2 | Your Organization | `submitter_info` (same shape as `party_a_info` in Direct MOU) |
| 3 | Cover | `company_name`, `venture_name`, `project_type`, `company_logo_url`, `cover_image_url` |
| 4 | Executive Summary | `executive_summary` |
| 5 | Company Overview | `company_overview` |
| 6 | Project Overview | `project_overview` |
| 7 | Financials | `financials` |
| 8 | Investment Ask | `investment_ask` (+ syncs `investment_amount`) |
| 9 | Contact | `contact_info` |
| — | Proposal file (upload anytime) | `file_url` / `proposal_file_url` |

**Do NOT show:** Party B Info step, MOU step, Party A/B labels — use **"Your organization"**.

---

## Endpoints

### Upload file

```
POST /api/matchmaking/proposals/upload
Content-Type: multipart/form-data
Field: proposal_file
```

**Response:**
```json
{ "file_url": "/uploads/proposals/abc.pdf" }
```

---

### Save draft (create or update)

```
POST /api/matchmaking/proposals/draft
```

**First save (create)** — send all collected fields.  
**Later saves** — include `proposal_id`.

#### Super Admin — create on behalf

| Side | Required on first save |
|------|------------------------|
| Side A | `party_a_id` (existing `party_a` user id) |
| Side B | `investor_id` (existing `investor` user id) |

#### Example — Side A draft (minimal excerpt)

```json
{
  "party_a_id": 1,
  "side": "side_a",
  "country": "Pakistan",
  "sector": "Agri-chemicals & Inputs",
  "engagement_type": "B2B",
  "company_name": "GreenTech Pakistan",
  "venture_name": "GreenTech Rice Mill JV",
  "project_type": "Greenfield",
  "conference_info": {
    "conference_name": "Pak-China Agri Conference 2026",
    "conference_date": "2026-09-15",
    "conference_location": "Islamabad",
    "conference_host": "Ministry of NFS&R"
  },
  "submitter_info": {
    "entity_type": "business",
    "organization_name": "GreenTech Pakistan",
    "contact_name": "Ali Khan",
    "designation": "CEO",
    "email": "partya@test.com",
    "phone": "03001234567",
    "country": "Pakistan",
    "city": "Lahore"
  },
  "executive_summary": { "...": "..." },
  "company_overview": { "...": "..." },
  "project_overview": { "...": "..." },
  "financials": { "years": [{ "label": "FY 2024", "metrics": { "total_revenue": "980" } }] },
  "investment_ask": {
    "total_project_cost_usd": "4200000",
    "investment_ask_equity_usd": "3200000",
    "fund_utilization_technology_pct": "50",
    "fund_utilization_infrastructure_pct": "30",
    "fund_utilization_working_capital_pct": "20"
  },
  "contact_info": {
    "name": "Ali Khan",
    "designation": "CEO",
    "email": "partya@test.com",
    "cell": "03001234567"
  },
  "file_url": "/uploads/proposals/demo.pdf",
  "keyword_tags": ["rice", "export"]
}
```

**Create response `201`:**
```json
{
  "proposal_id": 3,
  "status": "draft",
  "created_on_behalf_of": "Party A Test User",
  "created_on_behalf_of_email": "partya@test.com"
}
```

**Update response `200`:**
```json
{ "proposal_id": 3, "status": "draft" }
```

---

### Submit for review

```
POST /api/matchmaking/proposals/submit
{ "proposal_id": 3 }
```

**Success:** proposal `status` → `submitted`  
**Validation error `400`:**
```json
{
  "error": "Missing required fields",
  "missing_fields": ["Conference — Name", "Proposal File"],
  "fields": ["Conference — Name", "Proposal File"]
}
```

---

### Get proposal detail

```
GET /api/matchmaking/proposals/:id
```

**Response** — enriched flat object (keywords parsed):

```json
{
  "proposal": {
    "id": 1,
    "side": "side_a",
    "country": "Pakistan",
    "sector": "Agri-chemicals & Inputs",
    "title": "Pakistan — GreenTech Rice Mill JV",
    "status": "submitted",
    "engagement_type": "B2B",
    "venture_name": "Pakistan — GreenTech Rice Mill JV",
    "company_name": "GreenTech Pakistan",
    "conference_info": { "...": "..." },
    "submitter_info": { "...": "..." },
    "executive_summary": { "...": "..." },
    "company_overview": { "...": "..." },
    "project_overview": { "...": "..." },
    "financials": { "...": "..." },
    "investment_ask": { "...": "..." },
    "contact_info": { "...": "..." },
    "file_url": "/uploads/...",
    "keyword_tags": [],
    "match_id": null,
    "engagement_proposal_id": null
  }
}
```

---

## Field reference

### Table columns (`mm_proposals`)

| Column | Source |
|--------|--------|
| `country` | body.country |
| `sector` | body.sector |
| `side` | `side_a` \| `side_b` |
| `title` | body.venture_name or body.title |
| `description` | body.description or executive_summary.project_overview |
| `investment_amount` | body.investment_amount or investment_ask.total_project_cost_usd |
| `keywords` | JSON blob — all rich fields below |

### Inside `keywords` JSON

| Key | Type | Notes |
|-----|------|-------|
| `engagement_type` | string | G2G, B2B, B2G, G2B |
| `company_name` | string | |
| `venture_name` | string | |
| `project_type` | string | Greenfield / Brownfield |
| `company_logo_url` | string | optional |
| `cover_image_url` | string | optional |
| `proposal_file_url` | string | |
| `file_url` | string | alias for proposal file |
| `tags` | string[] | search tags (`keyword_tags` in API body) |
| `conference_info` | object | same as Direct MOU |
| `submitter_info` | object | **replaces party_a_info** — same keys |
| `executive_summary` | object | |
| `company_overview` | object | |
| `project_overview` | object | |
| `financials` | object | |
| `investment_ask` | object | |
| `contact_info` | object | |

### `submitter_info` shape (same as Direct MOU `party_a_info`)

```json
{
  "entity_type": "business",
  "organization_name": "",
  "department_ministry": "",
  "contact_name": "",
  "designation": "",
  "email": "",
  "phone": "",
  "country": "",
  "city": ""
}
```

---

## Validation rules

### Side A (`side_a`) — full

Same required fields as Direct MOU **Party A only** flow (`validatePartyAOnlySubmit`), plus:
- `country`, `side`, `Proposal File`
- Fund utilization % must total **100**

### Side B (`side_b`) — lighter

Same as legacy China investor flow:
- No conference required fields
- Fewer company/project/contact fields
- Fund utilization % must total **100**

---

## After match

When sector lead creates a match, backend builds engagement in `proposals` table with:
- Side A business content (primary)
- Side B `submitter_info` → `party_b_*` fields on engagement
- **No MOU** until sector lead uploads on engagement

Frontend after match: navigate to **`/proposals/{engagement_proposal_id}`** (not `/matchmaking/{id}`).

---

## Roles & routes

| Role | Create | My list | Review |
|------|--------|---------|--------|
| `party_a` | Side A only | `/matchmaking/my-proposals` | — |
| `investor` | Side B only | `/matchmaking/my-proposals` | — |
| `focal_point` | — | — | `/matchmaking/focal-point` |
| `sector_lead` | — | forwarded + board | `/matchmaking/board` |
| `super_admin` | both sides + on behalf | `/matchmaking/admin/*` | all |

**Super admin** bypasses all role middleware.

---

## Frontend implementation prompt

Copy-paste this to your frontend agent:

---

### PROMPT: Rebuild Matchmaking New Proposal Form (9-step wizard)

**Goal:** Replace the single-page `NewMmProposal.jsx` with a multi-step wizard matching Direct MOU business content, **without** Party B or MOU steps.

**Reference files:**
- Direct MOU wizard: `src/pages/proposals/NewProposal.jsx`
- Step constants: `src/constants/proposalTemplate.js` (`PROPOSAL_STEPS`, `EMPTY_PROPOSAL_FORM`, field shapes)
- Current MM page: `src/pages/matchmaking/NewMmProposal.jsx`
- API client: `src/api/matchmaking.js`
- Draft utils: `src/utils/mmProposalDraft.js`
- Backend spec: `MM_MATCHMAKING_PROPOSAL_FORM_API.md`

**Steps to implement:**

1. Add `MM_PROPOSAL_STEPS` in `constants/matchmaking.js` (9 steps — exclude Party B and MOU from `PROPOSAL_STEPS`).

2. Extend `EMPTY_MM_PROPOSAL_FORM` / `mmProposalDraft.js` to mirror `EMPTY_PROPOSAL_FORM` business fields but use `submitter_info` instead of `party_a_info`. Remove standalone `keywords` string field; use `keyword_tags: []`.

3. Rewrite `formToPayload()` to POST the full nested object to `POST /api/matchmaking/proposals/draft` per API doc. Map `keyword_tags` → `keyword_tags` in body. Include `file_url` after upload.

4. Rebuild `NewMmProposal.jsx` as multi-step wizard:
   - Reuse step components / JSX blocks from `NewProposal.jsx` where possible
   - Step 2 label: **"Your Organization"** — bind to `submitter_info`, not `party_a_info`
   - Hide Party B step and MOU step entirely
   - Keep Super Admin `OnBehalfOwnerPicker` before wizard
   - Auto-set `side` from role (`party_a` → `side_a`, `investor` → `side_b`)
   - Save draft on each "Save & Next" via `saveMmProposalDraft`
   - Final step: `submitMmProposal(proposalId)`
   - Show `missing_fields` from 400 response on submit

5. Edit flow: load `GET /api/matchmaking/proposals/:id`, hydrate form from enriched response (`submitter_info`, `conference_info`, etc.).

6. Side B (investor): use same wizard but skip/hide fields not required by Side B validation (conference optional, fewer company/project fields). Consider `isSideB` flag to trim steps or mark optional.

7. Do **not** add MOU fields or Party B counterparty fields to this form.

8. After submit, redirect to `/matchmaking/my-proposals` (or admin path if super admin).

**API endpoints (unchanged paths):**
- `POST /api/matchmaking/proposals/draft`
- `POST /api/matchmaking/proposals/submit`
- `POST /api/matchmaking/proposals/upload`
- `GET /api/matchmaking/proposals/:id`

**Test users:** `partya@test.com` (Side A), `investor@test.com` (Side B), `superadmin@test.com` — password `password123`

---

## Quick test (backend)

```bash
npm run db:seed:fresh
```

Seeded matchmaking proposals #1 (PK) and #2 (CN) include full business `keywords` and pass submit validation.

---

## Backward compatibility

Old minimal proposals (only `file_url` in keywords) still load but **fail submit** until rich fields are completed. `GET` detail returns sparse enriched objects for legacy rows.

# Step 9 — Engagement Type, Conference & Party Info (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** Party A for create/submit

Adds **G2G / B2B / B2G / G2B** selection, **conference details**, and dedicated **Party A / Party B** information steps before the MNFSR pitch template (Steps 4–11 from Step 8).

---

## Setup (one time)

```bash
cd investment-portal-backend
npm run db:migrate:proposal-engagement
npm run dev
```

Adds columns: `engagement_type`, `conference_info` (JSON), `party_a_info` (JSON), `party_b_entity_type`.

---

## New form flow (11 steps)

| Step | Section |
|------|---------|
| 1 | **Engagement Type & Conference** |
| 2 | **Party A Information** |
| 3 | **Party B Information** |
| 4 | Cover Page |
| 5 | Executive Summary |
| 6 | Company Overview |
| 7 | Project Overview |
| 8 | Financials |
| 9 | Investment Ask |
| 10 | Contact & Pitch Deck (optional file) |
| 11 | MOU |

See **`STEP8_PROPOSAL_TEMPLATE_API.md`** for steps 4–11 field details.

---

## Engagement types

| Value | Meaning | Suggested Party A | Suggested Party B |
|-------|---------|-----------------|-------------------|
| `G2G` | Government → Government | government | government |
| `B2B` | Business → Business | business | business |
| `B2G` | Business → Government | business | government |
| `G2B` | Government → Business | government | business |

Frontend auto-suggests entity types when user picks engagement type (user can override).

---

## Step 1 — Engagement & Conference

### Fields (`conference_info` + scalar)

| Field | Key | Required |
|-------|-----|----------|
| Engagement type | `engagement_type` | Yes |
| Conference name | `conference_info.conference_name` | Yes |
| Start date | `conference_info.conference_date` | Yes (YYYY-MM-DD) |
| End date | `conference_info.conference_end_date` | No |
| Location | `conference_info.conference_location` | Yes |
| Host / organizer | `conference_info.conference_host` | Yes |
| Description | `conference_info.conference_description` | No |

### UI

- 4 large buttons/cards for G2G, B2B, B2G, G2B
- After selection, show conference form below

---

## Step 2 — Party A Information

JSON object `party_a_info`:

| Field | Key | Required |
|-------|-----|----------|
| Entity type | `entity_type` | Yes (`government` \| `business`) |
| Organization name | `organization_name` | Yes |
| Department / Ministry | `department_ministry` | Show when `entity_type === government` |
| Contact name | `contact_name` | Yes |
| Designation | `designation` | Yes |
| Email | `email` | Yes |
| Phone | `phone` | Yes |
| Country | `country` | Yes |
| City | `city` | No |

---

## Step 3 — Party B Information

| Field | Key | Required |
|-------|-----|----------|
| Entity type | `party_b_entity_type` | Yes (`government` \| `business`) |
| Full name | `party_b_name` | Yes |
| Organization | `party_b_organization` | Yes |
| Email | `party_b_email` | Yes |
| Phone | `party_b_phone` | Yes |
| Country | `party_b_country` | Yes |

Used for Party B account + invite email on proposal approve (unchanged).

---

## API — Save draft (partial payload)

**`POST /api/proposals/draft`**

```json
{
  "proposal_id": 22,
  "engagement_type": "B2B",
  "conference_info": {
    "conference_name": "Pak-China Agri-Investment Conference 2026",
    "conference_date": "2026-09-15",
    "conference_end_date": "2026-09-17",
    "conference_location": "Islamabad, Pakistan",
    "conference_host": "Ministry of National Food Security & Research",
    "conference_description": "Bilateral matchmaking forum"
  },
  "party_a_info": {
    "entity_type": "business",
    "organization_name": "GreenTech Pakistan",
    "contact_name": "Ali Khan",
    "designation": "CEO",
    "email": "partya@test.com",
    "phone": "03001234567",
    "country": "Pakistan",
    "city": "Lahore"
  },
  "party_b_entity_type": "business",
  "party_b_name": "Li Wei",
  "party_b_organization": "SinoGrain Technologies",
  "party_b_email": "partyb@company.cn",
  "party_b_phone": "+86-139-0000-5678",
  "party_b_country": "China",
  "sector": "Agri-chemicals & Inputs",
  "company_name": "GreenTech Pakistan",
  "venture_name": "Rice Processing Hub"
}
```

Merge per step — same endpoint as Step 8.

---

## API — Submit

**`POST /api/proposals/submit`**

```json
{ "proposal_id": 22 }
```

New required validations (in addition to Step 8 template + MOU):

- `engagement_type`
- All conference required fields
- All Party A required fields
- `party_b_entity_type` + existing Party B fields

---

## API — Get detail

**`GET /api/proposals/:id`**

```json
{
  "id": 22,
  "engagement_type": "B2B",
  "conference_info": {
    "conference_name": "Pak-China Agri-Investment Conference 2026",
    "conference_date": "2026-09-15",
    "conference_location": "Islamabad, Pakistan",
    "conference_host": "MNFSR"
  },
  "party_a_info": {
    "entity_type": "business",
    "organization_name": "GreenTech Pakistan",
    "contact_name": "Ali Khan",
    "email": "partya@test.com"
  },
  "party_b_entity_type": "business",
  "party_b_name": "Li Wei",
  "party_b_email": "partyb@company.cn",
  "executive_summary": { "...": "..." },
  "financials": { "...": "..." }
}
```

---

## Frontend files

| File | Purpose |
|------|---------|
| `src/constants/proposalTemplate.js` | `ENGAGEMENT_TYPES`, `ENTITY_TYPES`, `TOTAL_STEPS`, form defaults |
| `src/pages/proposals/NewProposal.jsx` | 11-step wizard |
| `src/components/ProposalDetailPanel.jsx` | Reviewer detail — engagement, conference, Party A/B |
| `src/utils/proposalDraft.js` | Step detection for resume draft |

---

## UI notes

1. **Step 1 first** — block Next until `engagement_type` selected
2. **Conference section** — always visible after type selected (same step)
3. **Party A step** — pre-fill from logged-in user profile where possible (`email`, `full_name`)
4. **Party B step** — moved out of MOU step; MOU is step 11 only
5. **Detail page** — show engagement badge + conference block at top

---

## Related docs

- `STEP8_PROPOSAL_TEMPLATE_API.md` — pitch template steps 4–11
- `STEP5B_PARTY_B_API.md` — Party B email on approve

# Direct MOU (11-step) ↔ Imported MOU — Same MOU Details

Backend now **auto-syncs** wizard fields into the same operational columns used by JSON-imported MOUs, so **MOU Details** looks the same for both.

---

## One-time backfill (existing direct MOUs)

```bash
npm run db:backfill:direct-mou-operational
```

Re-run safe — only updates rows that are missing operational fields.

---

## When sync runs

| Event | Sync |
|-------|------|
| `POST /api/proposals/draft` (save draft) | ✅ auto |
| Sector lead **approve** | ✅ auto |
| JSON import | unchanged (already has fields) |

---

## Field mapping (wizard → MOU Details)

| MOU Details / List column | Source (11-step wizard) |
|---------------------------|-------------------------|
| **MOU Value** `investment_value_usd` | `investment_ask.total_project_cost_usd` |
| **Cooperation Mode** | default `mou` (or send `cooperation_mode`) |
| **Outcome / Description** `proposal_description` | `mou_description` → `project_overview.core_activity` |
| **Conference** `conference_name` | `conference_info.conference_name` |
| **Conference key** `conference_key` | send from conference picker (recommended) |
| **MOU Demand** `mou_demand` | derived from investment USD |
| **MOU Sector** `mou_sector` | auto-copied from `sector` (Key Sector) — **do not ask again on Step 11** |
| **SIFC Category** | `sifc_category` (root) → `executive_summary.sifc_category` |
| **Status** | `executive_summary.mou_operational_status` → default `Active` |
| **Progress** | `project_overview.core_activity` |
| **Bottleneck** | default `Nil` |
| **Location** | `project_overview.site_location` or `conference_info.conference_location` |
| **Tentative Timeline** | `investment_ask.milestone_phase_1` or `project_overview.phased_roadmap` |
| **Current Status** | `project_overview.site_readiness_status` |

Wizard-only sections (`company_overview`, `financials`, etc.) **stay** — nothing removed.

---

## Frontend — what to send on draft save

`POST /api/proposals/draft` body (existing) **plus**:

```json
{
  "sifc_category": "Import Substitution Investment",
  "conference_key": "pak-china-hangzhou-agri-2026",
  "cooperation_mode": "mou"
}
```

### Required for parity with imported MOUs

| Field | Where in wizard UI |
|-------|-------------------|
| `sifc_category` | **Add dropdown** (use `GET /api/sifc-categories`) |
| `conference_key` | Conference step — pick from `GET /api/conferences` (not free text only) |
| `investment_ask.total_project_cost_usd` | Investment step (already in wizard) |
| `party_a_info.email` | Companies / Party A (for Request for Update flow) |

If `sifc_category` is omitted, MOU Details **SIFC Category** stays empty until Sector Lead edits via **Edit MOU fields**.

---

## MOU Details tab — same API fields

Use the same bindings as imported MOUs (`GET /api/proposals/:id`):

```javascript
const exec = proposal.executive_summary;

// MOU Details grid
chineseCompany: proposal.chinese_company;       // party_b
pakistaniCompany: proposal.pakistani_company;   // company_name / party_a
sifcCategory: exec.sifc_category;
sector: proposal.sector;
cooperationMode: proposal.cooperation_mode;
mouValue: proposal.investment_value_usd;
status: exec.mou_operational_status;
outcome: proposal.proposal_description;
progress: exec.progress;
bottleneck: exec.bottlenecks;
timeline: exec.tentative_timeline;
location: exec.location;
conference: proposal.conference_name;
```

**Do not** use a separate layout for `id > 400` or direct vs imported — one component, same fields.

---

## Optional wizard sections (extra on direct MOUs only)

Show below MOU Details grid (collapsible):

- Engagement & Conference (`conference_info`, `engagement_type`)
- Party A / Party B cards
- Cover & Identity
- Company overview / Project overview / Financials / Investment ask

Imported MOUs hide empty sections; direct MOUs show them when data exists.

---

## Detect proposal type (UI only)

```javascript
const isWizardProposal = Boolean(
  proposal.company_overview?.years_in_operation ||
  proposal.financials?.years?.length ||
  proposal.investment_ask?.total_project_cost_usd
);
```

Use only to show/hide **extra** wizard sections — **not** for MOU Details grid.

---

## After approve / draft save

Refetch `GET /api/proposals/:id` — `executive_summary`, `investment_value_usd`, `conference_name` should be populated.

Example after sync (proposal 418):

```json
{
  "investment_value_usd": 1,
  "cooperation_mode": "mou",
  "proposal_description": "1",
  "conference_name": "1",
  "executive_summary": {
    "mou_operational_status": "Active",
    "progress": "1",
    "bottlenecks": "Nil",
    "location": "1",
    "tentative_timeline": "1",
    "sifc_category": ""
  }
}
```

---

## Checklist

- [ ] Add `sifc_category` to 11-step wizard (SIFC categories API)
- [ ] Conference step sends `conference_key` + `conference_info`
- [ ] MOU Details uses **one** component for all proposals
- [ ] Run backfill on server after deploy
- [ ] Party A email on Companies tab before Request for Update

---

## Related

- `MOU_FULL_FIELD_EDIT_FRONTEND.md` — edit operational fields after approve
- `REQUEST_FOR_UPDATE_FRONTEND.md` — Party A email requirement

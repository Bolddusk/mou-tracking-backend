# Step 11 — Proposal Export Report (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** Sector Lead or Super Admin only

Sector lead and super admin can **export a per-proposal report** with Party A/B details, investment value, proposal overview, and **all activity updates** (date-wise, column-wise) including comments and approvals.

---

## Who can export

| Role | Access |
|------|--------|
| `sector_lead` | Proposals in their sector (not `draft`) |
| `super_admin` | Any non-draft proposal |
| Others | `403` |

---

## API

### Export report (JSON)

```
GET /api/proposals/:id/export-report
Authorization: Bearer <sector_lead_or_super_admin_token>
```

**Example:**

```
GET http://localhost:5000/api/proposals/25/export-report
```

### Export formats

| Format | Query | Behaviour |
|--------|-------|-----------|
| **JSON** | (default) | API response for preview |
| **PDF** | `?format=pdf` | Opens in browser tab (`Content-Disposition: inline`) |
| **Excel** | `?format=xlsx` or `?format=xls` | Downloads `.xlsx` — opens in Excel / Google Sheets |
| **CSV** | `?format=csv` | Downloads CSV (Excel import if needed) |

```
GET /api/proposals/:id/export-report?format=pdf
GET /api/proposals/:id/export-report?format=xlsx
GET /api/proposals/:id/export-report?format=csv
Authorization: Bearer <token>
```

**Recommendation:** Use **PDF** for quick browser view, **Excel** for editing/sharing, **CSV** for data tools.

---

## JSON response shape

```json
{
  "generated_at": "2026-06-08T12:00:00.000Z",
  "generated_by": {
    "id": 3,
    "name": "Sector Lead User",
    "role": "sector_lead"
  },
  "proposal": {
    "id": 25,
    "title": "AVRIO Party B Email Test",
    "venture_name": "AVRIO Party B Email Test",
    "status": "approved",
    "sector": "Agri-chemicals & Inputs",
    "engagement_type": "B2B",
    "submitted_at": "2026-06-08T05:35:00.000Z",
    "reviewed_at": "2026-06-08T06:00:00.000Z",
    "reviewed_by_name": "Sector Lead User",
    "sector_lead_comment": "Approved — good fit."
  },
  "parties": {
    "party_a": {
      "name": "Ali Khan",
      "organization": "GreenTech Pakistan",
      "email": "partya@test.com",
      "phone": "03001234567",
      "entity_type": "business",
      "country": "Pakistan",
      "city": "Lahore"
    },
    "party_b": {
      "name": "Li Wei",
      "organization": "SinoGrain Technologies Co.",
      "email": "agentaaugmenteck@yopmail.com",
      "phone": "+86-139-0000-5678",
      "country": "China",
      "entity_type": "business"
    }
  },
  "value": {
    "investment_ask_summary": "USD 4.2M equity for plant and Chinese automation line",
    "total_project_cost_usd": 5200000,
    "investment_ask_equity_usd": 4200000,
    "investment_ask_debt_usd": 1000000,
    "total_funds_required_pkr_mn": "1490",
    "sponsor_contribution_pkr_mn": "310",
    "raising_from_investors_pkr_mn": "1180",
    "projected_irr_pct": "19",
    "payback_period_years": "7"
  },
  "overview": {
    "venture_name": "AVRIO Party B Email Test",
    "company_name": "GreenTech Pakistan",
    "project_type": "Greenfield",
    "engagement_type": "B2B",
    "conference_name": "Pak-China Agri-Investment Conference 2026",
    "mou_scope": "Joint venture technology transfer",
    "mou_description": "MOU for Chinese milling automation...",
    "executive_summary": {
      "company_overview": "...",
      "project_overview": "...",
      "project_segment": "...",
      "sector_alignment": "...",
      "investment_ask_summary": "..."
    },
    "company_overview": { "...": "..." },
    "project_overview": { "...": "..." }
  },
  "updates": [
    {
      "id": 1,
      "activity_date": "2026-06-01",
      "title": "Site visit completed",
      "description": "Visited Sheikhupura site with Party B rep.",
      "status": "approved",
      "added_by_name": "Ali Khan",
      "added_by_role": "party_a",
      "support_file_url": "http://localhost:5000/uploads/proof.pdf",
      "is_poke": false,
      "poke_response": null,
      "comments": [
        {
          "id": 1,
          "text": "Looks good — please share MOU draft next.",
          "author_name": "Sector Lead User",
          "author_role": "sector_lead",
          "created_at": "2026-06-02T10:00:00.000Z"
        }
      ],
      "approvals": [
        {
          "action": "approved",
          "comment": "Verified on call.",
          "action_by_name": "Sector Lead User",
          "action_by_role": "sector_lead",
          "actioned_at": "2026-06-02T11:00:00.000Z"
        }
      ]
    }
  ],
  "summary": {
    "total_activities": 3,
    "approved_activities": 2,
    "pending_activities": 1,
    "rejected_activities": 0
  }
}
```

### Report sections

| Section | Contents |
|---------|----------|
| `parties` | Party A & B names, org, email, phone, country |
| `value` | USD costs, equity ask, PKR figures, IRR, payback |
| `overview` | Executive summary, company/project overview, MOU, venture |
| `updates` | Activities sorted **date-wise** (oldest first) |
| Each update | Title, description, status, comments[], approvals[], poke response |

---

## CSV format

Two blocks in one file (Excel-friendly with UTF-8 BOM):

**Block 1 — Proposal summary** (Field / Value rows):

- Party A Name, Party B Name
- Total Project Cost, Investment Ask
- Executive overview fields
- Review notes

**Block 2 — Activity updates** (column-wise, date-wise):

| Column | Description |
|--------|-------------|
| Activity Date | `YYYY-MM-DD` |
| Title | Activity title |
| Description | Full description |
| Status | `pending` / `approved` / `rejected` |
| Added By | User name |
| Added By Role | `party_a`, `sector_lead`, etc. |
| Comments | All comments joined (`Author (role) [date]: text`) |
| Approvals | Approval actions joined |
| Poke Response | Party A poke response if any |
| Support File URL | Attachment link |

---

## Frontend integration

### 1. API helper (`src/api/proposals.js`)

```javascript
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export async function getProposalExportReport(proposalId) {
  const res = await fetch(`${API}/api/proposals/${proposalId}/export-report`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Export failed')
  }
  return res.json()
}

export async function downloadProposalExport(proposalId, format = 'pdf') {
  // format: 'pdf' | 'xlsx' | 'csv'
  // PDF → window.open(blob) in new tab
  // xlsx/csv → anchor download
}
```

UI: compact **PDF | Excel | CSV** button group (`ProposalExportMenu` component).
```

### 2. Show export button

On **Proposal Detail** page — visible when:

```javascript
const canExportReport = isSectorLead || isSuperAdmin
```

Place near Approve/Reject or in a “Reports” dropdown:

```jsx
{canExportReport && proposal?.status !== 'draft' && (
  <div className="flex gap-2">
    <button type="button" onClick={() => downloadProposalExportCsv(proposal.id)}>
      Export CSV
    </button>
    <button type="button" onClick={handleExportJson}>
      Export JSON
    </button>
  </div>
)}
```

### 3. Optional — preview before download

```javascript
async function handleExportJson() {
  const report = await getProposalExportReport(proposalId)
  // open modal with sections: parties, value, overview, updates table
  setExportPreview(report)
}
```

### 4. Activities table in preview UI

Render `report.updates` as a date-sorted table:

| Date | Title | Status | Added By | Comments |
|------|-------|--------|----------|----------|
| 2026-06-01 | Site visit | approved | Ali Khan | Sector Lead: Looks good… |

Expand row for full description, approvals, poke response, file link.

### 5. Sector lead dashboard

Add “Export” action per row in pending/approved lists:

```jsx
<Link to={`/proposals/${p.id}?export=csv`}>Export</Link>
```

Or icon button calling `downloadProposalExportCsv(p.id)`.

---

## Postman test

1. Login as `sectorlead@test.com` / `password123`
2. Copy `token`
3. **JSON:**
   ```
   GET http://localhost:5000/api/proposals/25/export-report
   Authorization: Bearer <token>
   ```
4. **CSV:**
   ```
   GET http://localhost:5000/api/proposals/25/export-report?format=csv
   Authorization: Bearer <token>
   ```
   Save response as `.csv` and open in Excel.

---

## Errors

| Status | Error |
|--------|-------|
| `403` | Wrong role or wrong sector |
| `400` | Draft proposal |
| `404` | Proposal not found |

---

## Backend files

| File | Purpose |
|------|---------|
| `server/utils/proposalReport.js` | Build JSON + CSV |
| `server/controllers/proposalReportController.js` | HTTP handler |
| `server/routes/proposalRoutes.js` | `GET /:id/export-report` |

---

## Related docs

- `STEP3_ACTIVITIES_API.md` — Activity timeline structure
- `STEP8_PROPOSAL_TEMPLATE_API.md` — Overview / value fields
- `STEP9_PROPOSAL_ENGAGEMENT_API.md` — Party A/B info
- `STEP2_SECTOR_REVIEW_API.md` — Sector lead access

# Sector Lead Dashboard — Frontend Integration

**Backend:** your API host (e.g. `http://localhost:5000`)  
**Auth:** `Authorization: Bearer <token>`  
**Role:** `sector_lead`

Sector Lead list API now matches **Super Admin** format: `{ data, pagination, filters }` with the same query filters (scoped to the sector lead's assigned sector).

---

## 1. Breaking change — list response shape

**Before:** `GET /api/proposals/sector-lead` returned a **plain array** `[...]`

**Now:** returns paginated object (same as Super Admin):

```json
{
  "data": [ /* proposal objects with mou_lifecycle, poke status, etc. */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "total_pages": 3,
    "has_next": true,
    "has_prev": false
  },
  "filters": {
    "conference_key": null,
    "cooperation_mode": null,
    "status": null,
    "sector": "Agri-chemicals & Inputs",
    "mou_lifecycle": null,
    "q": null,
    "date_from": null,
    "date_to": null
  }
}
```

### Frontend fix (why "All" was empty)

```tsx
// OLD — broken after backend update
const proposals = response.data;

// NEW
const proposals = response.data.data;
const pagination = response.data.pagination;
```

`filters.sector` is always the sector lead's assigned sector (auto-scoped on backend).

---

## 2. List proposals

```
GET /api/proposals/sector-lead
Authorization: Bearer <token>
```

### Query params (all optional)

| Param | Example | Notes |
|-------|---------|-------|
| `page` | `1` | Default `1` |
| `limit` | `20` | Default `20`, max `100` |
| `status` | `approved` | Omit for **All** statuses in sector |
| `mou_lifecycle` | `active` | `active` \| `inactive` \| `execution` |
| `conference_key` | `pak-china-islamabad-agri-2026` | |
| `cooperation_mode` | `mou` | `mou` \| `jv` \| `agreement` |
| `q` | `ASKARI` | Server-side search |
| `date_from` | `2026-06-01` | `YYYY-MM-DD` |
| `date_to` | `2026-06-30` | `YYYY-MM-DD` |

**Do not send `sector`** — backend always filters by the logged-in sector lead's sector.

### Status tabs

| UI tab | API call |
|--------|----------|
| **All** | `GET /api/proposals/sector-lead?page=1&limit=20` (no `status`) |
| **Submitted** | `...&status=submitted` |
| **Approved** | `...&status=approved` |
| **Rejected** | `...&status=rejected` |

**Note:** Old backend defaulted to `submitted` + `resubmitted` only when status was omitted. **New behavior:** omitting `status` returns **all non-draft** proposals in the sector (including approved historic MOUs). Drafts are Party A private until submit — they never appear in the sector lead list.

### Example

```
GET /api/proposals/sector-lead?page=1&limit=20&status=approved&mou_lifecycle=active&conference_key=pak-china-islamabad-agri-2026&q=seed
```

---

## 3. Filter options (same URL as Super Admin)

```
GET /api/proposals/filter-options
Authorization: Bearer <token>
```

**Roles:** `sector_lead`, `super_admin`

Sector lead gets **scoped** options:

```json
{
  "proposal_statuses": ["draft", "submitted", "approved", "rejected", "resubmitted", "completed"],
  "mou_lifecycle_statuses": [
    { "value": "active", "label": "Active" },
    { "value": "inactive", "label": "Inactive" },
    { "value": "execution", "label": "Execution" }
  ],
  "cooperation_modes": [
    { "value": "mou", "label": "MoU" },
    { "value": "jv", "label": "JV" },
    { "value": "agreement", "label": "Agreement" }
  ],
  "conferences": [
    {
      "key": "pak-china-islamabad-agri-2026",
      "name": "PAKISTAN-CHINA Agriculture B2B Investment Conference, Islamabad",
      "proposal_count": 12,
      "mou_count": 8,
      "jv_count": 4,
      "agreement_count": 0
    }
  ],
  "sectors": ["Agri-chemicals & Inputs"],
  "scoped_sector": "Agri-chemicals & Inputs",
  "pagination_defaults": { "page": 1, "limit": 20, "max_limit": 100 }
}
```

| Field | Sector Lead | Super Admin |
|-------|-------------|-------------|
| `conferences` | Counts **only proposals in assigned sector** | All proposals |
| `sectors` | Single-item array `[assigned sector]` | All sectors |
| `scoped_sector` | Assigned sector name | `null` |

No separate filter-options URL for sector lead.

---

## 4. Table columns (suggested)

Same as updated Super Admin list:

| Show | Hide |
|------|------|
| Mode (`cooperation_mode`) | Pitch (`has_pitch` — removed) |
| MOU Status (`mou_lifecycle_label`) | MOU file column (`has_mou` — removed) |
| Approve / Reject (submitted only) | Deal Closed filter |

Each row includes:

```json
{
  "mou_lifecycle": "active",
  "mou_lifecycle_label": "Active",
  "cooperation_mode": "mou",
  "status": "approved"
}
```

---

## 5. Other endpoints (unchanged)

| Action | Method | Endpoint |
|--------|--------|----------|
| Approve | `PATCH` | `/api/proposals/:id/approve` |
| Reject | `PATCH` | `/api/proposals/:id/reject` |
| Detail | `GET` | `/api/proposals/:id` |
| Edit party contacts | `PATCH` | `/api/proposals/:id/party-contacts` |
| Export report | `GET` | `/api/proposals/:id/export-report` |

---

## 6. Frontend example

```tsx
async function loadSectorLeadProposals(token: string, filters: ListFilters) {
  const params = new URLSearchParams({
    page: String(filters.page || 1),
    limit: String(filters.limit || 20),
  });

  if (filters.status) params.set('status', filters.status);
  if (filters.mouLifecycle) params.set('mou_lifecycle', filters.mouLifecycle);
  if (filters.conferenceKey) params.set('conference_key', filters.conferenceKey);
  if (filters.cooperationMode) params.set('cooperation_mode', filters.cooperationMode);
  if (filters.q) params.set('q', filters.q);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);

  const [listRes, optionsRes] = await Promise.all([
    api.get(`/api/proposals/sector-lead?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    api.get('/api/proposals/filter-options', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  return {
    rows: listRes.data.data,
    pagination: listRes.data.pagination,
    filterOptions: optionsRes.data,
  };
}
```

---

## 7. Errors

| Status | Error |
|--------|-------|
| `400` | `Sector lead profile has no sector assigned` |
| `400` | Invalid filter param (status, mou_lifecycle, date, etc.) |
| `401` | No token |
| `403` | Wrong role on filter-options (not sector_lead / super_admin) |

---

## 8. Test checklist

1. Login as `sectorlead@test.com`
2. `GET /api/proposals/sector-lead?page=1&limit=20` → `data` array not empty (if sector has proposals)
3. **All** tab (no status) → includes approved historic MOUs in sector
4. `GET /api/proposals/filter-options` → `200`, conferences scoped to sector counts
5. Search `q=ASKARI` → filtered results
6. `mou_lifecycle=inactive` → only inactive rows in sector

---

## Related docs

- `CONFERENCE_FILTER_PAGINATION_FRONTEND.md` — Super Admin list (same shape)
- `MOU_LIFECYCLE_FILTER_FRONTEND.md` — MOU Status filter values
- `PROPOSAL_PARTY_CONTACTS_FRONTEND.md` — edit party contacts on detail

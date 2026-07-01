# Conference Filter + Pagination — Frontend Integration

**Backend:** your API host (e.g. `http://localhost:5000`)  
**Auth:** `Authorization: Bearer <token>`  
**Role:** `super_admin` only

---

## 1. One-time setup (run on server yourself)

After deploying backend code:

```bash
npm run db:migrate:conference-fields
```

This adds `conference_key` + `conference_name` to proposals and backfills all **43 imported Hangzhou Agri MOUs** with:

| Field | Value |
|-------|--------|
| `conference_key` | `pak-china-hangzhou-agri-2026` |
| `conference_name` | `PAKISTAN-CHINA ICT&BESS and Agriculture B2B Investment Conference, Hangzhou` |

No need to re-import Excel if records already exist — migration updates them.

---

## 2. Breaking change — list response shape

**Before:** `GET /api/proposals/all` returned a plain array `[...]`

**Now:** returns paginated object:

```json
{
  "data": [ /* proposal objects */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 43,
    "total_pages": 3,
    "has_next": true,
    "has_prev": false
  },
  "filters": {
    "conference_key": "pak-china-hangzhou-agri-2026",
    "cooperation_mode": null,
    "status": null,
    "sector": null,
    "mou_status": null,
    "q": null
  }
}
```

**Frontend update required:**
```js
// OLD
const proposals = response.data; // if axios

// NEW
const proposals = response.data.data;
const pagination = response.data.pagination;
```

---

## 3. Pagination query params

**`GET /api/proposals/all`**

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `page` | `1` | — | Page number (1-based) |
| `limit` | `20` | `100` | Items per page |

**Examples:**
```
GET /api/proposals/all?page=1&limit=20
GET /api/proposals/all?page=2&limit=10
```

**UI suggestions:**
- Show: `Showing 1–20 of 43`
- Prev/Next buttons using `pagination.has_prev` / `pagination.has_next`
- Optional page size dropdown: 10 / 20 / 50

---

## 4. Conference filter (fetch all MOU / JV / Agreement for one conference)

### Filter options endpoint

```
GET /api/proposals/filter-options
```

**New `conferences` array in response:**

```json
{
  "conferences": [
    {
      "key": "pak-china-hangzhou-agri-2026",
      "name": "PAKISTAN-CHINA ICT&BESS and Agriculture B2B Investment Conference, Hangzhou",
      "proposal_count": 43,
      "mou_count": 38,
      "jv_count": 3,
      "agreement_count": 2
    }
  ],
  "cooperation_modes": [
    { "value": "mou", "label": "MoU" },
    { "value": "jv", "label": "JV" },
    { "value": "agreement", "label": "Agreement" }
  ],
  "pagination_defaults": {
    "page": 1,
    "limit": 20,
    "max_limit": 100
  }
}
```

Populate **Conference dropdown** from `conferences[].name`, store `conferences[].key` as value.

### Filter by conference

```
GET /api/proposals/all?conference_key=pak-china-hangzhou-agri-2026
```

Returns **all record types** (MoU + JV + Agreement) for that conference.

### Conference + cooperation mode combined

```
GET /api/proposals/all?conference_key=pak-china-hangzhou-agri-2026&cooperation_mode=mou
GET /api/proposals/all?conference_key=pak-china-hangzhou-agri-2026&cooperation_mode=jv
GET /api/proposals/all?conference_key=pak-china-hangzhou-agri-2026&cooperation_mode=agreement
```

### Full example with pagination + filters

```
GET /api/proposals/all?conference_key=pak-china-hangzhou-agri-2026&cooperation_mode=mou&page=1&limit=20&status=approved
```

---

## 5. All available filter params (combinable)

| Param | Example | Description |
|-------|---------|-------------|
| `page` | `1` | Page number |
| `limit` | `20` | Page size |
| `conference_key` | `pak-china-hangzhou-agri-2026` | Conference filter |
| `cooperation_mode` | `mou` / `jv` / `agreement` | MoU, JV, or Contract |
| `status` | `approved` | Proposal workflow status |
| `sector` | `Agri-chemicals & Inputs` | Portal sector |
| `mou_status` | `signed` | MOU lifecycle |
| `q` | `ASKARI` | Search text |
| `date_from` | `2026-06-01` | Created from |
| `date_to` | `2026-06-30` | Created to |
| `has_mou` | `true` | MOU file exists |
| `has_pitch` | `true` | Pitch file exists |
| `deal_closed` | `false` | Deal open |

---

## 6. Suggested Super Admin UI

```
[ Conference ▼ ]  [ Cooperation Mode ▼ ]  [ Sector ▼ ]  [ Status ▼ ]

[ Search... ]  [ MOU Status ▼ ]  [ Has MOU ▼ ]  [ Clear filters ]

Showing 1–20 of 43          [ ◀ Prev ]  Page 1 of 3  [ Next ▶ ]
```

**On conference change:**
1. Set `conference_key` query param
2. Reset `page` to `1`
3. Refetch `GET /api/proposals/all?...`
4. Optional: show summary chips from filter-options counts:
   - `38 MoU` · `3 JV` · `2 Agreement`

---

## 7. Proposal detail — conference display

Each proposal row now includes:

```json
{
  "id": 44,
  "conference_key": "pak-china-hangzhou-agri-2026",
  "conference_name": "PAKISTAN-CHINA ICT&BESS and Agriculture B2B Investment Conference, Hangzhou",
  "cooperation_mode": "mou",
  "conference_info": {
    "conference_name": "PAKISTAN-CHINA ICT&BESS and Agriculture B2B Investment Conference, Hangzhou",
    "conference_date": "2026-06-15",
    "conference_location": "Shanghai, China",
    "conference_host": "Government of Pakistan"
  }
}
```

Use `conference_name` in proposal header / details tab (already partially shown in Engagement & Conference section).

---

## 8. Frontend state example (React)

```tsx
const [filters, setFilters] = useState({
  conference_key: '',
  cooperation_mode: '',
  status: '',
  sector: '',
  mou_status: '',
  q: '',
  page: 1,
  limit: 20,
});

async function fetchProposals() {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });

  const res = await api.get(`/api/proposals/all?${params}`);
  setRows(res.data.data);
  setPagination(res.data.pagination);
}

function onConferenceChange(key: string) {
  setFilters((prev) => ({ ...prev, conference_key: key, page: 1 }));
}
```

---

## 9. Error responses

```json
{ "error": "Invalid cooperation_mode filter" }
{ "error": "Invalid conference_key filter" }
```

---

## 10. Deploy checklist

```bash
git pull
npm install
npm run db:migrate:conference-fields
npm start
```

Frontend:
- [ ] Update list fetch to use `response.data.data`
- [ ] Add pagination UI (page, limit, prev/next)
- [ ] Add Conference dropdown from `filter-options.conferences`
- [ ] Wire `conference_key` + `cooperation_mode` filters together
- [ ] Reset to page 1 when any filter changes

---

## 11. Future conferences

When a new conference is added (new import batch):
- Each proposal gets a new `conference_key` + `conference_name`
- `GET /api/proposals/filter-options` automatically lists all distinct conferences from DB
- No frontend code change needed — dropdown populates dynamically

---

## Related docs

- `HISTORIC_MOU_FILTERING_FRONTEND.md` — historic MOU ack + original filters
- `STEP14_SUPER_ADMIN_MODULES.md` — Super Admin module map

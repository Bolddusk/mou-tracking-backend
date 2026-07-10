# Dashboard Tabs — All / Active / Inactive / Execution

**Roles:** `super_admin`, `admin`, `sector_lead`  
**Replaces:** Draft / Submitted / Approved / Rejected tabs and summary cards

Workflow status (`draft`, `submitted`, `approved`, …) stays on each proposal row for review actions — **do not** use it for dashboard tabs anymore.

---

## 1. Filter options (load once on dashboard)

```
GET /api/proposals/filter-options
Authorization: Bearer <token>
```

### New fields

```json
{
  "dashboard_list_filter_param": "mou_lifecycle",
  "dashboard_list_tab_filters": [
    { "key": "all", "label": "All", "query": {} },
    { "key": "active", "label": "Active", "query": { "mou_lifecycle": "active" } },
    { "key": "inactive", "label": "Inactive", "query": { "mou_lifecycle": "inactive" } },
    { "key": "execution", "label": "Execution", "query": { "mou_lifecycle": "execution" } }
  ],
  "mou_lifecycle_counts": {
    "all": 174,
    "active": 150,
    "inactive": 20,
    "execution": 4
  },
  "mou_lifecycle_statuses": [
    { "value": "active", "label": "Active" },
    { "value": "inactive", "label": "Inactive" },
    { "value": "execution", "label": "Execution" }
  ]
}
```

| Field | Use |
|-------|-----|
| `mou_lifecycle_counts` | Top summary cards (Total + Active + Inactive + Execution) |
| `dashboard_list_tab_filters` | Pill buttons next to search |
| `dashboard_list_filter_param` | Always `mou_lifecycle` — **not** `status` |

---

## 2. List API by role

| Role | List endpoint |
|------|----------------|
| `super_admin`, `admin` | `GET /api/proposals/all` |
| `sector_lead` | `GET /api/proposals/sector-lead` |

### Tab → query

| UI tab | API |
|--------|-----|
| **All** | `GET ...?page=1&limit=20` (omit `mou_lifecycle` and `status`) |
| **Active** | `GET ...?mou_lifecycle=active&page=1&limit=20` |
| **Inactive** | `GET ...?mou_lifecycle=inactive&page=1&limit=20` |
| **Execution** | `GET ...?mou_lifecycle=execution&page=1&limit=20` |

Combine with existing filters (`conference_key`, `cooperation_mode`, `sector`, `q`, dates, archive).

**Remove** `status=draft|submitted|approved|rejected` from dashboard tab clicks.

---

## 3. UI changes

### Summary cards (top row)

**Remove:** Draft, Submitted, Approved, Rejected  
**Show:**

| Card | Count from | Color suggestion |
|------|------------|------------------|
| **Total** | `mou_lifecycle_counts.all` | Green |
| **Active** | `mou_lifecycle_counts.active` | Green |
| **Inactive** | `mou_lifecycle_counts.inactive` | Gray |
| **Execution** | `mou_lifecycle_counts.execution` | Blue |

Clicking a card selects the matching tab and refetches the list.

### Filter pills (next to search)

Replace `All | Draft | Submitted | Approved | Rejected` with:

`All | Active | Inactive | Execution`

Render from `dashboard_list_tab_filters` — do not hardcode.

### Table column

Show **`mou_lifecycle_label`** (Active / Inactive / Execution), not workflow `status` badge, as the primary MOU status column for staff dashboards.

Keep workflow status (`submitted`, `approved`, …) only where review actions need it (e.g. approve/reject buttons).

---

## 4. React example

```tsx
const { data: opts } = useQuery('/api/proposals/filter-options');
const [tab, setTab] = useState('all');

const listPath =
  role === 'sector_lead' ? '/api/proposals/sector-lead' : '/api/proposals/all';

const tabDef = opts.dashboard_list_tab_filters.find((t) => t.key === tab);
const params = { page, limit, ...tabDef?.query };

// Cards
opts.mou_lifecycle_counts.all;
opts.mou_lifecycle_counts.active;
// ...

// List
const { data } = useQuery([listPath, params], () => api.get(listPath, { params }));
const rows = data.data; // not data directly
```

---

## 5. Lifecycle meanings

| Value | Meaning |
|-------|---------|
| `active` | Ongoing collaboration |
| `inactive` | Dropped / inactive |
| `execution` | Contract / deal closed / in execution |

See `MOU_LIFECYCLE_FILTER_FRONTEND.md` for filter SQL rules.

---

## 6. Checklist

- [ ] Remove Draft / Submitted / Approved / Rejected cards and pills (SA, Admin, SL)
- [ ] Cards + pills from `GET /api/proposals/filter-options`
- [ ] List filter uses `mou_lifecycle`, not `status`
- [ ] Admin uses `GET /api/proposals/all` (same as Super Admin)
- [ ] Sector Lead still uses `GET /api/proposals/sector-lead`
- [ ] Table shows `mou_lifecycle_label`

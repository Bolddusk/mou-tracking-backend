# MOU Lifecycle Filter — Frontend Integration

**Backend:** your API host (e.g. `http://localhost:5000`)  
**Auth:** `Authorization: Bearer <token>`  
**Role:** `super_admin` (list + filter options)

Replaces the old Super Admin filters **Has MOU**, **Has Pitch**, and **Deal Closed** with a single **MOU Status** dropdown using business lifecycle values.

---

## 1. What changed

| Removed filters | New filter |
|-----------------|------------|
| `has_mou` | — |
| `has_pitch` | — |
| `deal_closed` | — |
| Old `mou_status` (`uploaded`, `signed`, etc.) on list API | **`mou_lifecycle`** |

### New MOU Status values (UI label)

| Value | Label | Meaning |
|-------|-------|---------|
| `active` | **Active** | Ongoing collaboration — not dropped, not yet in contract/execution |
| `inactive` | **Inactive** | Dropped / inactive collaboration (e.g. imported B2B rows marked dropped) |
| `execution` | **Execution** | Moved to contract — deal closed, completed, or cooperation mode **Agreement** |

---

## 2. Filter options

```
GET /api/proposals/filter-options
Authorization: Bearer <token>
```

### Response (relevant part)

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
  "sectors": ["..."],
  "conferences": ["..."]
}
```

**Note:** `mou_statuses` (old upload workflow values) is **no longer** returned on filter-options. Use `mou_lifecycle_statuses` for the Super Admin dropdown.

---

## 3. List proposals with MOU Status filter

```
GET /api/proposals/all?mou_lifecycle=active
GET /api/proposals/all?mou_lifecycle=inactive
GET /api/proposals/all?mou_lifecycle=execution
```

Combine with other filters:

```
GET /api/proposals/all?conference_key=pak-china-islamabad-agri-2026&mou_lifecycle=active&page=1&limit=20
```

| Param | Values |
|-------|--------|
| `mou_lifecycle` | `active` \| `inactive` \| `execution` (omit = all) |

### Response `filters` echo

```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "limit": 20, "total": 45, "total_pages": 3 },
  "filters": {
    "conference_key": null,
    "cooperation_mode": null,
    "status": null,
    "sector": null,
    "mou_lifecycle": "active",
    "q": null
  }
}
```

---

## 4. Each proposal row — display field

Every proposal in list/detail now includes:

```json
{
  "id": 59,
  "mou_status": "uploaded",
  "mou_lifecycle": "inactive",
  "mou_lifecycle_label": "Inactive",
  "cooperation_mode": "mou",
  "executive_summary": {
    "collaboration_dropped": true
  }
}
```

| Field | Use in UI |
|-------|-----------|
| `mou_lifecycle` | Filter value / badge key (`active`, `inactive`, `execution`) |
| `mou_lifecycle_label` | Human label for table column (**Active**, **Inactive**, **Execution**) |
| `mou_status` | Internal workflow (upload/signed) — **do not** use for Super Admin MOU Status dropdown |

### How backend classifies

| `mou_lifecycle` | Rule (priority order) |
|-----------------|------------------------|
| **execution** | `mou_status = deal_closed` OR `status = completed` OR `cooperation_mode = agreement` OR `deal_closed_at` set |
| **inactive** | `executive_summary.collaboration_dropped = true` OR current status text contains "Dropped" / "Inactive" |
| **active** | Everything else |

Execution takes priority over inactive (a closed deal is never shown as inactive).

---

## 5. Suggested UI

**Remove** from filter bar:
- Has MOU
- Has Pitch
- Deal Closed

**Keep / update:**
- **MOU Status** dropdown → options from `mou_lifecycle_statuses`

```
[ Conference ▼ ]  [ Cooperation Mode ▼ ]  [ Sector ▼ ]  [ MOU Status ▼ ]

Options: All | Active | Inactive | Execution
```

**Table column** (optional): show `mou_lifecycle_label` with badges:

| Lifecycle | Suggested badge color |
|-----------|----------------------|
| Active | Green |
| Inactive | Gray / red |
| Execution | Blue |

---

## 6. Frontend example

```tsx
type MouLifecycle = 'active' | 'inactive' | 'execution' | '';

async function loadFilterOptions(token: string) {
  const res = await api.get('/api/proposals/filter-options', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.mou_lifecycle_statuses as { value: string; label: string }[];
}

async function loadProposals(token: string, filters: { mouLifecycle?: MouLifecycle }) {
  const params = new URLSearchParams({ page: '1', limit: '20' });
  if (filters.mouLifecycle) params.set('mou_lifecycle', filters.mouLifecycle);

  const res = await api.get(`/api/proposals/all?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    rows: res.data.data,
    pagination: res.data.pagination,
  };
}

// Table cell
function MouLifecycleBadge({ row }: { row: { mou_lifecycle: string; mou_lifecycle_label: string } }) {
  const colors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-600',
    execution: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={colors[row.mou_lifecycle] || ''}>
      {row.mou_lifecycle_label}
    </span>
  );
}
```

---

## 7. Errors

| Status | When |
|--------|------|
| `400` | `Invalid mou_lifecycle filter — use active, inactive, or execution` |
| `400` | Sending removed params `has_mou`, `has_pitch`, `deal_closed` — **ignored** (no error, simply not applied) |

---

## 8. Migration checklist (frontend)

1. Remove **Has MOU**, **Has Pitch**, **Deal Closed** dropdowns from Super Admin list
2. Change MOU Status dropdown to use `GET /api/proposals/filter-options` → `mou_lifecycle_statuses`
3. Send `mou_lifecycle` query param (not `mou_status`) on `GET /api/proposals/all`
4. Display `mou_lifecycle_label` in table (not raw `mou_status` for this column)
5. Clear filters: reset `mou_lifecycle` to empty / "All"

---

## Related docs

- `CONFERENCE_FILTER_PAGINATION_FRONTEND.md` — conference + pagination on same list API
- `HISTORIC_MOU_FILTERING_FRONTEND.md` — historic MOU ack rules

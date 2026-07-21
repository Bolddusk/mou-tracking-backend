# Conference / SIFC Report API — Frontend

## Business logic

- Sirf **reportable** conferences (`supports_report: true` in filter-options).
- **No extra filters** → same as before: full conference report (role-scoped).
- **With dashboard filters** → report = **exactly the filtered list** (same query params as Opportunities table).
- Roles:
  | Role | Report scope |
  |------|----------------|
  | `super_admin` / `admin` | All non-draft MOUs for that conference (+ filters) |
  | `sector_lead` | Own assigned sectors only (+ filters) |
  | `party_a` | Own linked MOUs only |
  | `party_b` / `investor` | Own linked MOUs only |

---

## Endpoint

```
GET /api/proposals/conference-report
```

### Required

| Param | Example |
|-------|---------|
| — | `conference_key` **optional** |

### Conference scope

| UI selection | Query |
|--------------|--------|
| **All conferences** | omit `conference_key` **or** `conference_key=all` |
| Specific conference | `conference_key=pak-china-may-24-b2b` |

```
GET /api/proposals/conference-report?format=pdf
GET /api/proposals/conference-report?conference_key=all&format=xlsx
GET /api/proposals/conference-report?conference_key=pak-china-may-24-b2b&format=pdf
```

### Format

| `format` | Response |
|----------|----------|
| `json` (default) | Preview JSON |
| `xlsx` | Excel download |
| `pdf` | PDF (`&download=1` for attachment) |

### Optional filters (same as list / Opportunities)

Pass **the same query string** you use for `GET /api/proposals/all` (or sector-lead list), minus `page` / `limit`:

| Param | Example | Effect |
|-------|---------|--------|
| `sector` | `Seed Sales` | Only that sector |
| `cooperation_mode` | `mou` \| `jv` \| `agreement` | Mode filter |
| `sifc_category` | `Investment Export Oriented` | SIFC category |
| `mou_lifecycle` | `active` \| `inactive` \| `execution` | Lifecycle pill |
| `date_from` / `date_to` | `2024-01-01` | `YYYY-MM-DD` on `created_at` |
| `q` | `ms group` | Search text |
| `archive` / `archive_filter` | `active` \| `archived` \| `all` | Archive scope |
| `status` | `approved` | Workflow status (rare for SIFC) |

**Rule:** Jo table mein rows dikh rahi hain (us conference + filters pe), wahi SIFC report mein aani chahiye.

---

## Frontend wiring (dashboard)

```ts
// Current Opportunities filters + selected conference
function buildSifcReportQuery(filters: {
  conference_key?: string | null; // omit / 'all' / null → All conferences
  sector?: string;
  cooperation_mode?: string;
  sifc_category?: string;
  mou_lifecycle?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
  archive?: string;
  format?: 'json' | 'xlsx' | 'pdf';
  download?: '1';
}) {
  const params = new URLSearchParams();
  params.set('format', filters.format || 'json');

  const key = filters.conference_key;
  if (key && key !== 'all' && key !== 'all_conferences') {
    params.set('conference_key', key);
  }

  const optional = [
    'sector',
    'cooperation_mode',
    'sifc_category',
    'mou_lifecycle',
    'date_from',
    'date_to',
    'q',
    'archive',
  ] as const;

  for (const key of optional) {
    const value = filters[key];
    if (value != null && String(value).trim() !== '' && String(value) !== 'all') {
      params.set(key, String(value));
    }
  }

  if (filters.download) params.set('download', filters.download);
  return params.toString();
}

// Preview
const qs = buildSifcReportQuery({ ...dashboardFilters, conference_key, format: 'json' });
const report = await api.get(`/api/proposals/conference-report?${qs}`);

// PDF
window.open(
  `${API}/api/proposals/conference-report?${buildSifcReportQuery({
    ...dashboardFilters,
    conference_key,
    format: 'pdf',
  })}`,
  '_blank'
);

// Excel
window.open(
  `${API}/api/proposals/conference-report?${buildSifcReportQuery({
    ...dashboardFilters,
    conference_key,
    format: 'xlsx',
  })}`,
  '_blank'
);
```

### Examples

**General (All conferences):**
```
GET /api/proposals/conference-report?format=pdf
```

**General (one conference — old behaviour):**
```
GET /api/proposals/conference-report?conference_key=pak-china-may-24-b2b&format=pdf
```

**Filtered (matches screenshot: MoU + Seed Sales):**
```
GET /api/proposals/conference-report?conference_key=pak-china-may-24-b2b&cooperation_mode=mou&sector=Seed%20Sales&format=pdf
```

**All conferences + sector filter:**
```
GET /api/proposals/conference-report?sector=Agricultural%20Biotechnology&format=pdf
```

---

## JSON extras

```json
{
  "conference": { "key", "name", "report_title" },
  "scope": {
    "list_scope": "all",
    "filters_applied": true,
    "filters": {
      "conference_key": "...",
      "sector": "Seed Sales",
      "cooperation_mode": "mou",
      "sifc_category": null,
      "mou_lifecycle": null,
      "q": null,
      "date_from": null,
      "date_to": null
    }
  },
  "proposal_count": 2,
  "summary_counts": { "in_execution": 0, "active": 2, "inactive": 0 },
  "snapshot": { "rows": [] },
  "sections": { "in_execution": [], "active": [], "inactive": [] }
}
```

Use `proposal_count` / `scope.filters_applied` in UI subtitle, e.g.  
`SIFC report · 2 MOUs (filtered)` vs `SIFC report · 48 MOUs`.

### Sector in subtitle (required)

When a sector filter is selected, **do not** show `All sectors (filtered)`.

```ts
const sector = report.scope?.filters?.sector; // e.g. "Seed Sales"
const sectorLabel = sector ? sector : 'All sectors';
// subtitle example:
// `All conferences · ${report.proposal_count} MOUs · ${sectorLabel}`
```

PDF/Excel HTML also prints `Sector: <name>` in the meta line when filtered.

### Detail table columns (backend HTML / PDF / Excel)

**MoUs in Execution** now includes:
- Sector
- **Bottleneck** (from `bottlenecks`) — **not** Action Taken

**Active / Inactive** also include Sector + Bottleneck.

Row JSON still has `action_taken` for compatibility; preview tables should use `bottlenecks` + `sector` if you render columns client-side.

---

## Buttons (your dashboard)

| Button | Call |
|--------|------|
| Preview SIFC report | `format=json` then render / print |
| Download SIFC report (PDF) | `format=pdf` |
| Download SIFC report (Excel) | `format=xlsx` |

Show buttons when conference has `supports_report === true`.

---

## Errors

| Code | When |
|------|------|
| 400 | Invalid filter / invalid format |
| 403 | Role not allowed / conference not reportable / SL sector outside scope |
| 404 | Unknown `conference_key` |
| 503 | PDF Chromium missing — use Excel |

---

## Checklist

- [ ] Buttons show for **All conferences** and specific conference
- [ ] All conferences → call **without** `conference_key` (or `=all`)
- [ ] Preview/PDF/Excel use **same** filter state as Opportunities table
- [ ] Clearing filters → full report again (all or one conference)
- [ ] Sector Lead cannot pass another sector
- [ ] Party A/B only get their own MOUs in the report
- [ ] Empty filter result → empty report (0 rows), not an error
- [ ] Selected sector → subtitle shows sector name (not “All sectors”)
- [ ] Execution table shows Bottleneck + Sector (not Action Taken)

# Conference & SIFC Lookup APIs — Frontend

Backend support for **MOU Edit** form changes:

1. **Remove** `Party A Organization` from full-field edit (use `company_name` / Pakistani company instead).
2. **Conference** → dropdown (`conference_key`); name auto-synced.
3. **SIFC Category** → dropdown (`executive_summary.sifc_category`).
4. **Admin CRUD** for both lookup lists.

---

## Deploy / migrate

```bash
npm run db:migrate:conferences-sifc
```

Restart API after migrate (caches load on startup).

---

## 1. MOU edit form — field catalog

`GET /api/proposals/:id/editable-fields`

**New response fields:**

```json
{
  "catalog": {
    "excluded_party_a_info_keys": ["organization_name"],
    "read_only_lookup_scalar_fields": ["conference_name"],
    "lookup_fields": {
      "conference_key": {
        "source": "conferences",
        "value_field": "key",
        "label_field": "name",
        "sync_scalar_fields": ["conference_name"],
        "sync_json_fields": ["conference_info"]
      },
      "executive_summary.sifc_category": {
        "source": "sifc_categories",
        "value_field": "name",
        "label_field": "name"
      }
    }
  },
  "conferences": [
    {
      "id": 1,
      "key": "pak-china-sep-25-conference",
      "conference_key": "pak-china-sep-25-conference",
      "name": "Pak China Sep-25 Conference",
      "supports_report": true,
      "sort_order": 1
    }
  ],
  "sifc_categories": [
    { "id": 1, "name": "Trade – Export", "sort_order": 1 },
    { "id": 2, "name": "Investment – Export Oriented", "sort_order": 2 }
  ]
}
```

### UI changes (Edit MOU modal)

| Remove | Replace with |
|--------|----------------|
| **Party A Organization** text field | Nothing — hide completely |
| **Conference name** free text | **Conference** `<select>` bound to `conference_key` |
| **Conference key** free text (optional) | Hide — show selected conference **name** as read-only subtitle if needed |
| **SIFC Category** free text | **SIFC Category** `<select>` |

**Pakistani company** stays as `company_name` (scalar field).

---

## 2. Save MOU fields

`PATCH /api/proposals/:id/fields`

### Conference

Send **only** `conference_key` (not `conference_name`):

```json
{
  "conference_key": "pak-china-sep-25-conference"
}
```

Backend sets:

- `conference_name` (read-only)
- `conference_info` JSON (dates, location, host)

Sending `conference_name` alone → **400**:

```json
{ "error": "conference_name is read-only — send conference_key from the conferences dropdown" }
```

### SIFC

```json
{
  "executive_summary": {
    "sifc_category": "Trade – Export"
  }
}
```

Invalid value → **400** `Invalid sifc_category — choose from active SIFC categories list`.

### Party A info

Do **not** send `party_a_info.organization_name` — it is stripped/ignored. Use:

```json
{ "company_name": "Himalayan Pink Salt House (Private) Limited" }
```

---

## 3. Dropdown data (any logged-in user)

Use these for forms outside editable-fields if needed.

### Conferences

`GET /api/conferences`

```json
{
  "conferences": [
    { "key": "pak-china-sep-25-conference", "name": "Pak China Sep-25 Conference", "supports_report": true }
  ],
  "count": 3
}
```

### SIFC categories

`GET /api/sifc-categories`

```json
{
  "categories": [{ "id": 1, "name": "Trade – Export" }],
  "names": ["Trade – Export", "Investment – Export Oriented"],
  "count": 5
}
```

---

## 4. Admin CRUD

**Auth:** `super_admin` or permission `admin.sectors` (same as Sectors admin).

### Conferences

| Method | Path | Body |
|--------|------|------|
| `GET` | `/api/admin/conferences` | — |
| `GET` | `/api/admin/conferences/:id` | — |
| `POST` | `/api/admin/conferences` | see below |
| `PATCH` | `/api/admin/conferences/:id` | partial |
| `DELETE` | `/api/admin/conferences/:id` | — (409 if linked to proposals) |

**Create body:**

```json
{
  "conference_key": "pak-china-new-event-2026",
  "name": "Pak-China New Event 2026",
  "conference_date": "2026-12-01",
  "conference_end_date": "2026-12-02",
  "location": "Islamabad",
  "host": "Government of Pakistan",
  "report_title": "Optional report title",
  "supports_report": true,
  "sort_order": 10
}
```

`conference_key` is slugified server-side (lowercase, hyphens).

**Rename key/name:** linked proposals are updated automatically.

### SIFC categories

| Method | Path | Body |
|--------|------|------|
| `GET` | `/api/admin/sifc-categories` | — |
| `GET` | `/api/admin/sifc-categories/:id` | — |
| `POST` | `/api/admin/sifc-categories` | `{ "name": "Trade – Export", "sort_order": 1 }` |
| `PATCH` | `/api/admin/sifc-categories/:id` | `{ "name": "...", "is_active": false, "sort_order": 2 }` |
| `DELETE` | `/api/admin/sifc-categories/:id` | — (409 if used on MOUs) |

Renaming a category updates `executive_summary.sifc_category` on all linked proposals.

---

## 5. React example (Edit MOU modal)

```tsx
// Load once when opening modal
const { data } = await api.get(`/api/proposals/${id}/editable-fields`);
const conferences = data.conferences;
const sifcCategories = data.sifc_categories;

// Conference dropdown
<select
  value={form.conference_key ?? ''}
  onChange={(e) => setForm((f) => ({ ...f, conference_key: e.target.value }))}
>
  <option value="">Select conference</option>
  {conferences.map((c) => (
    <option key={c.key} value={c.key}>{c.name}</option>
  ))}
</select>

// SIFC dropdown
<select
  value={form.executive_summary?.sifc_category ?? ''}
  onChange={(e) =>
    setForm((f) => ({
      ...f,
      executive_summary: { ...f.executive_summary, sifc_category: e.target.value },
    }))
  }
>
  <option value="">Select SIFC category</option>
  {sifcCategories.map((c) => (
    <option key={c.id ?? c.name} value={c.name}>{c.name}</option>
  ))}
</select>

// Save — only changed fields
await api.patch(`/api/proposals/${id}/fields`, {
  conference_key: form.conference_key,
  company_name: form.company_name,
  executive_summary: {
    sifc_category: form.executive_summary?.sifc_category,
    mou_operational_status: form.executive_summary?.mou_operational_status,
    progress: form.executive_summary?.progress,
  },
});
```

---

## 6. Admin settings pages (suggested routes)

| Page | List API | Mutations |
|------|----------|-----------|
| `/admin/conferences` | `GET /api/admin/conferences` | POST / PATCH / DELETE |
| `/admin/sifc-categories` | `GET /api/admin/sifc-categories` | POST / PATCH / DELETE |

Mirror existing **Sectors** admin UI pattern.

---

## 7. Errors

| Code | When |
|------|------|
| 400 | Invalid `conference_key` / `sifc_category`; sent `conference_name` directly |
| 403 | No edit access |
| 409 | Delete conference/category still in use — use `is_active: false` instead |

---

## 8. Checklist

- [ ] Remove **Party A Organization** from Edit MOU form
- [ ] Conference = dropdown → PATCH `conference_key` only
- [ ] SIFC = dropdown → PATCH `executive_summary.sifc_category`
- [ ] Admin screens for conference + SIFC CRUD (optional but recommended)
- [ ] Run `npm run db:migrate:conferences-sifc` on live after deploy

---

## 9. Conference `engagement_type` + `description` (admin form)

**Migrate:**

```bash
npm run db:migrate:conference-engagement
```

### New fields on conference records

| Field | Type | Values / notes |
|-------|------|----------------|
| `engagement_type` | enum (optional) | `B2B`, `B2G`, `G2B`, `G2G` — API accepts lowercase (`b2b`) and stores uppercase |
| `description` | text (optional) | Shown in `conference_info.conference_description` on linked MOUs |

### Admin create / update body

```json
{
  "name": "Pak-China New Event 2026",
  "conference_key": "pak-china-new-event-2026",
  "engagement_type": "B2B",
  "description": "B2B agriculture investment matchmaking event in Islamabad.",
  "conference_date": "2026-12-01",
  "conference_end_date": "2026-12-02",
  "location": "Islamabad",
  "host": "Government of Pakistan",
  "report_title": "Optional SIFC report title",
  "supports_report": true,
  "sort_order": 10
}
```

### List responses include enum helper

`GET /api/conferences` and `GET /api/admin/conferences`:

```json
{
  "engagement_types": ["B2B", "B2G", "G2B", "G2G"],
  "conferences": [
    {
      "id": 1,
      "key": "pak-china-sep-25-conference",
      "name": "Pak China Sep-25 Conference",
      "engagement_type": "B2B",
      "description": "Historic signed records imported for ...",
      "supports_report": true
    }
  ]
}
```

### Add conference modal — UI

Add to **Add / Edit conference** form:

1. **Engagement type** — `<select>` with options from `engagement_types` (or hardcode `B2B`, `B2G`, `G2B`, `G2G`).
2. **Description** — `<textarea>` bound to `description`.

On save → `POST /api/admin/conferences` or `PATCH /api/admin/conferences/:id` with both fields.

When a MOU picks this conference (`PATCH` `conference_key`), backend also sets:

- `proposal.engagement_type` from conference
- `proposal.conference_info.conference_description` from conference `description`

Updating a conference in admin cascades to all MOUs with that `conference_key`.

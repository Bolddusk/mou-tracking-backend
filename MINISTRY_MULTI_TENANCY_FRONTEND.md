# Ministry Multi-Tenancy + Power Admin (Frontend)

**Auth:** `Authorization: Bearer <token>`  
**Base API:** `/api`

Existing MOUs / conferences / users were backfilled to **MNFSR**. New records must carry a ministry.

---

## Roles (quick)

| Role | Scope | UI behaviour |
|------|--------|----------------|
| `super_admin` | All ministries | Full write + Settings + **Ministries CRUD** |
| `power_admin` | All ministries | **Same MOU powers as Super Admin** (approve, edit, upload, chat, comments, create, archive, etc.); **no Settings** (Users / Sectors / Ministries / Permissions) |
| `party_a` / `party_b` / `sector_lead` / `admin` | Own `ministry_id` | Existing powers, lists scoped to their ministry |

---

## Login / `user` object

After login / `GET /api/auth/me`:

```json
{
  "id": 1,
  "role": "power_admin",
  "ministry_id": null,
  "ministry": null,
  "is_global": true
}
```

Scoped user example:

```json
{
  "role": "party_a",
  "ministry_id": 1,
  "ministry": {
    "id": 1,
    "code": "mnfsr",
    "name": "Ministry of National Food Security & Research",
    "is_active": true
  },
  "is_global": false
}
```

**FE:**
- If `role === 'power_admin'` → hide entire Settings nav
- Use `ministry` / `ministry_id` on create forms and badges

---

## 1. Ministries API

### List

```
GET /api/ministries
```

Who: Super Admin, Power Admin, Admin, Sector Lead, Party A (for create dropdowns)

- **Super Admin / Power Admin:** full list (`All ministries` + every ministry) — use for dashboard filter
- **Sector Lead / Admin / Party A:** API returns **only their own ministry** (never other ministries)
- **Sector Lead dashboard:** **hide the Ministry filter dropdown entirely** — lists are already scoped to their ministry; no need to pick

```
GET /api/ministries
```

Scoped roles never see `power11` if they belong to MNFSR, etc.

SA inactive too: `GET /api/ministries?all=1`

```json
{
  "data": [
    { "id": 1, "code": "mnfsr", "name": "Ministry of National Food Security & Research", "is_active": true }
  ],
  "total": 1
}
```

### CRUD (Super Admin only)

```
POST   /api/ministries          { "code": "power", "name": "Ministry of Energy" }
PATCH  /api/ministries/:id      { "name": "...", "code": "...", "is_active": false }
DELETE /api/ministries/:id
```

- Cannot delete `mnfsr`
- If in use → `400` with `usage: { users, proposals, conferences }` — deactivate instead

**Settings UI:** new tab **Ministries** (SA only).

---

## 2. Create / draft MOU

Send **`ministry_id`** on create / save draft:

```
POST /api/proposals/draft
{ "ministry_id": 1, "venture_name": "...", "conference_key": "pak-china-may-24-b2b", ... }
```

Rules:
- Required for new drafts
- Party A / SL: must be **their** ministry (or omit and backend uses theirs)
- Super Admin: pick any ministry from dropdown
- Power Admin: **cannot** create/edit proposals (`403`)
- If `conference_key` set → conference must belong to same ministry

---

## 3. Conferences

```
GET /api/conferences
GET /api/conferences?ministry_id=1   // SA / PA optional filter
```

Each conference includes `ministry_id`.

Admin create conference (Settings):

```
POST /api/admin/conferences
{ "ministry_id": 1, "conference_key": "...", "name": "..." }
```

`ministry_id` **required**.

---

## 4. Users (Settings)

### Tabs (unchanged keys + Admins includes Power Admin)

| Tab | `?tab=` |
|-----|---------|
| Party A | `party_a` |
| Party B | `party_b` |
| Sector Leads | `sector_lead` |
| Admins | `admins` → `super_admin`, `admin`, `power_admin` |

```
GET /api/users?tab=party_a
GET /api/users?tab=admins&ministry_id=1   // SA/PA optional ministry filter
GET /api/users/tabs
GET /api/users/roles
```

List response shape:

```json
{
  "data": [ { "id": 1, "role": "party_a", "ministry_id": 1, ... } ],
  "tabs": [ { "key": "party_a", "label": "Party A", "count": 24 } ],
  "total": 24,
  "ministry_id": null
}
```

### Create user

```json
{
  "full_name": "...",
  "email": "...",
  "password": "...",
  "role": "sector_lead",
  "ministry_id": 1,
  "sector": "Seed Sales"
}
```

- `party_a` / `party_b` / `sector_lead` / `admin` → **`ministry_id` required**
- `super_admin` / `power_admin` → no ministry (omit / null)

Show **Ministry** column in Users table.

Roles dropdown: no Investor / Focal Point.

---

## 5. Power Admin (proposal / MOU work)

Power Admin can do **everything Super Admin can on MOUs** (approve, reject, edit fields, contacts, upload/delete MOU, activities, chat, archive, reports, create Direct MOU).

**Only difference:** hide entire **Settings** (Users, Sectors, Conferences admin, Ministries CRUD, Permissions, Sector Officer Change, Audit).

Use `capabilities` from proposal detail — treat like Super Admin for write buttons. Still hide Settings nav when `role === 'power_admin'`.

### New Direct MOU (sidebar)

Power Admin **must** see **New Direct MOU** (same create flow as Super Admin / Party A).

Backend already grants:
- `nav.proposals.new_direct`
- `proposals.create` / `proposals.submit` / `proposals.upload`

**FE:**
1. Sidebar: show item when `rbac.permissions` / nav includes `nav.proposals.new_direct` (do **not** hardcode `role === 'super_admin'` only)
2. Route: same Direct MOU create page SA uses
3. After logout/login, check login payload — `nav.proposals.new_direct` should be present for `power_admin`

Banner text “use Add MOUS on the MOUS page” — for PA, either show that nav or link **New Direct MOU** from Opportunities.

---

## 6. Party A / B email → account (Companies tab)

When email is saved and account is provisioned:

- New user → **same ministry as the MOU**
- Existing email, **same ministry** → link OK
- Existing email, **different ministry** → **400**

```json
{
  "error": "This email is already registered under a different ministry",
  "code": "ministry_email_conflict"
}
```

Show a clear toast / inline error — do not treat as generic failure.

---

## Dashboard counts + ministry filter

When ministry (or other filters) change, cards must update.

1. Prefer counts from list response:
```
GET /api/proposals/all?ministry_id=2
```
Response includes `mou_lifecycle_counts: { all, active, inactive, execution }` — **use these for the top cards**.

2. Or re-fetch:
```
GET /api/proposals/filter-options?ministry_id=2
```
Same `mou_lifecycle_counts` (now respects `ministry_id`).

If ministry has 0 MOUs → cards should show **0**, not the global 173.

---

## FE checklist

- [ ] Login: store `ministry_id`, `ministry`, `is_global`
- [ ] Settings → Ministries CRUD (SA only)
- [ ] Hide Settings for `power_admin`
- [ ] MOU create: Ministry dropdown + send `ministry_id`
- [ ] Conference create: require `ministry_id`
- [ ] Users: ministry column + required on create (scoped roles)
- [ ] Admins tab shows Power Admin
- [ ] Handle `ministry_email_conflict` on party contacts
- [ ] Power Admin: full MOU actions like SA; **Settings hide only**
- [ ] Power Admin: allow Conference / SIFC report pages (same as SA) — API already allows `power_admin`
- [ ] Optional SA/PA filter: `ministry_id` on `/proposals/all` and `/users`
- [ ] Sector Lead: **hide Ministry dropdown** (auto own ministry; API also returns only theirs)
- [ ] Top cards (TOTAL/ACTIVE/…) from `mou_lifecycle_counts` on list or filter-options (not hard-coded global)
- [ ] Progress tab: show **Add Progress Update** when `can_add_progress` / `capabilities.can_add_activity` (include `power_admin`)
- [ ] Power Admin: show **New Direct MOU** sidebar (`nav.proposals.new_direct`) — same create flow as SA

---

## Backend setup (deploy)

```bash
npm run db:migrate:ministries
npm run db:sync:role-permissions
```

Also widens `proposal_activities.added_by_role` (+ `power_admin`) so Progress updates work.

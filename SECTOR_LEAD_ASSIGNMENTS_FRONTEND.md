# Sector Lead M:N Assignments — Frontend Integration

## Business logic

- Ek **sector lead** ab **multiple sectors** cover kar sakta hai; ek sector par **multiple leads** ho sakte hain.
- Source of truth: `sector_lead_assignments` table. `users.sector` = **primary sector** (display / backward compat).
- Sector lead ko proposal/detail tabhi milta hai jab `proposal.sector` unke `assigned_sectors` mein ho.
- Proposal list SL ke liye: saari assigned sectors ka union (`IN` filter), drafts hidden.
- Sector **rename** (`PATCH /api/admin/sectors/:id`) assignments table ko bhi update karta hai.
- **Handoff** (`PATCH /api/admin/sector-lead/reassign`): open complaints + mm_proposals ko naye SL par move karta hai — naya SL us sector par **pehle se assigned** hona chahiye.

---

## Auth / session

### `GET /api/auth/me`

**Response (sector_lead user excerpt):**
```json
{
  "user": {
    "role": "sector_lead",
    "sector": "Agri Chemicals & Inputs",
    "primary_sector": "Agri Chemicals & Inputs",
    "assigned_sectors": ["Agri Chemicals & Inputs", "Livestock & Dairy"]
  },
  "rbac": {
    "context": {
      "scoped_sector": "Agri Chemicals & Inputs",
      "scoped_sectors": ["Agri Chemicals & Inputs", "Livestock & Dairy"],
      "list_scope": "sector",
      "proposals_list_api": "/api/proposals/sector-lead"
    }
  }
}
```

Frontend: list API `rbac.capabilities.proposals_list_api` se lo; filters ke liye `scoped_sectors` use karo.

---

## Sector lead — proposals

### `GET /api/proposals/sector-lead`

Query: `page`, `limit`, `conference_key`, `status`, `mou_lifecycle`, `q`, `date_from`, `date_to`

**Note:** `sector` query filter SL ke liye ignore hota hai (scope server-side).

**Response excerpt:**
```json
{
  "data": [/* proposals */],
  "pagination": { "page": 1, "limit": 20, "total": 42 },
  "filters": {
    "sectors": ["Agri Chemicals & Inputs", "Livestock & Dairy"],
    "sector": null
  }
}
```

### `GET /api/proposals/filter-options`

SL ke liye `sectors` = assigned list; `scoped_sectors` array milta hai.

---

## Admin — sector assignments

**Auth:** `super_admin` ya permission `nav.sectors.manage` / `admin.sectors`

### `GET /api/admin/sector-leads`

Query (optional): `?sector=Agri Chemicals & Inputs`

**Response:**
```json
{
  "count": 10,
  "sector_leads": [
    {
      "id": 5,
      "full_name": "Sector Lead — Agri Chemicals & Inputs",
      "email": "agri-chemicals-and-inputs-sectorlead@test.com",
      "primary_sector": "Agri Chemicals & Inputs",
      "sectors": ["Agri Chemicals & Inputs", "Livestock & Dairy"],
      "assignments": [
        { "sector": "Agri Chemicals & Inputs", "is_primary": 1 },
        { "sector": "Livestock & Dairy", "is_primary": 0 }
      ]
    }
  ]
}
```

### `GET /api/admin/sector-leads/:userId/sectors`

**Response:**
```json
{
  "user_id": 5,
  "full_name": "...",
  "email": "...",
  "primary_sector": "Agri Chemicals & Inputs",
  "sectors": ["Agri Chemicals & Inputs", "Livestock & Dairy"],
  "assignments": [/* ... */]
}
```

### `PUT /api/admin/sector-leads/:userId/sectors`

**Request:**
```json
{
  "sectors": ["Agri Chemicals & Inputs", "Livestock & Dairy"],
  "primary_sector": "Agri Chemicals & Inputs"
}
```

**Response:**
```json
{
  "message": "Sector assignments updated",
  "user_id": 5,
  "primary_sector": "Agri Chemicals & Inputs",
  "sectors": ["Agri Chemicals & Inputs", "Livestock & Dairy"],
  "assignments": [/* ... */]
}
```

**Errors:** `400` invalid/empty sectors; `404` user not sector_lead.

---

## Admin — handoff (existing, updated rule)

**Auth:** `admin.sl_reassign`

### `PATCH /api/admin/sector-lead/reassign`

**Request:**
```json
{
  "sector": "Agri Chemicals & Inputs",
  "new_sl_user_id": 12,
  "reason": "Annual rotation"
}
```

**Business rule:** `new_sl_user_id` ko `sector` par assignment honi chahiye (`PUT .../sectors` se set karo).

**Response:**
```json
{
  "message": "Sector Lead reassigned",
  "complaints_updated": 2,
  "mm_proposals_updated": 1,
  "sector": "Agri Chemicals & Inputs",
  "new_sector_lead": { "id": 12, "full_name": "...", "email": "..." },
  "previous_sector_lead_ids": [5]
}
```

---

## Public dropdown (complaints / matchmaking)

### `GET /api/users/sector-leads?sector=...`

**Response:** array with `id`, `full_name`, `email`, `primary_sector`, `sectors[]`

Filter: sirf woh SL jinke paas us sector ki assignment hai.

---

## Sector rename (unchanged path)

### `PATCH /api/admin/sectors/:id`

Body: `{ "name": "New Sector Name" }` — proposals, users, mm_proposals, **assignments** cascade update.

---

## DB setup (backend)

```bash
npm run db:migrate:sector-lead-assignments
npm run db:seed:sector-leads
```

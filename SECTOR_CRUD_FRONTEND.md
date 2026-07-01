# Sector CRUD — Frontend Integration

**Backend:** your API host (e.g. `http://localhost:5000`)  
**Auth:** `Authorization: Bearer <token>`

Sectors are stored in the database (not hardcoded). Admin users can create, update, and delete sectors. All other roles read **active** sectors for dropdowns and filters.

---

## 1. Roles & access

| Endpoint group | Roles |
|----------------|-------|
| **Read active sectors** | Any logged-in user |
| **Admin CRUD** | `super_admin`, `admin` only |

`super_admin` can access everything (existing auth bypass).

---

## 2. Migration (once per environment)

```bash
npm run db:migrate:sectors
```

Creates `sectors` table and seeds the original 10 Agriculture sectors. Safe to re-run (skips existing names).

---

## 3. Read active sectors (dropdowns / forms)

Use this for proposal forms, Party A profile, filters — anywhere you need sector options.

```
GET /api/sectors
Authorization: Bearer <token>
```

### Response `200`

```json
{
  "sectors": [
    "Agri-chemicals & Inputs",
    "Agri Technology & Precision Agriculture Solutions",
    "Meat & Poultry Industry"
  ],
  "items": [
    {
      "id": 1,
      "name": "Agri-chemicals & Inputs",
      "is_active": true,
      "sort_order": 1,
      "created_at": "2026-06-30T10:00:00.000Z",
      "updated_at": "2026-06-30T10:00:00.000Z"
    }
  ],
  "count": 10
}
```

- `sectors` — string array (backward compatible with old hardcoded list)
- `items` — full objects with `id` (use for admin cross-reference)

**Also available (legacy):**

```
GET /api/profile/sectors
GET /api/proposals/filter-options   → response.sectors (super_admin list filters)
```

All return active sectors only after migration.

---

## 4. Admin — list all sectors (incl. inactive)

```
GET /api/admin/sectors
Authorization: Bearer <token>
```

**Roles:** `super_admin`, `admin`

### Response `200`

```json
{
  "sectors": [
    {
      "id": 4,
      "name": "Meat & Poultry Industry",
      "is_active": true,
      "sort_order": 4,
      "created_at": "2026-06-30T10:00:00.000Z",
      "updated_at": "2026-06-30T10:00:00.000Z",
      "usage": {
        "proposals": 12,
        "users": 1,
        "mm_proposals": 0,
        "total": 13
      }
    }
  ],
  "count": 10
}
```

---

## 5. Admin — get one sector

```
GET /api/admin/sectors/:id
```

Same shape as list item (with `usage`).

---

## 6. Admin — create sector

```
POST /api/admin/sectors
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Halal Food Export Corridor",
  "sort_order": 11
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | Unique, max 255 chars |
| `sort_order` | No | Default `0`; lower = higher in list |

### Response `201`

```json
{
  "message": "Sector created",
  "sector": {
    "id": 11,
    "name": "Halal Food Export Corridor",
    "is_active": true,
    "sort_order": 11,
    "created_at": "...",
    "updated_at": "..."
  }
}
```

New sector appears immediately in `GET /api/sectors` (active by default).

---

## 7. Admin — update sector

```
PATCH /api/admin/sectors/:id
Content-Type: application/json
```

Send only fields to change:

```json
{
  "name": "Meat & Poultry Industry (Updated)",
  "is_active": false,
  "sort_order": 5
}
```

| Field | Effect |
|-------|--------|
| `name` | Renames sector; **cascades** to `proposals.sector`, `users.sector`, `mm_proposals.sector` |
| `is_active` | `false` hides from dropdowns; existing records keep the name |
| `sort_order` | Controls display order |

### Response `200`

```json
{
  "message": "Sector updated",
  "sector": { "id": 4, "name": "...", "is_active": false, "usage": { ... } }
}
```

---

## 8. Admin — delete sector

```
DELETE /api/admin/sectors/:id
```

- **Allowed** only when `usage.total === 0` (no proposals, users, or matchmaking records)
- If in use → `409`:

```json
{
  "error": "Sector is in use and cannot be deleted. Deactivate it instead.",
  "usage": {
    "proposals": 5,
    "users": 1,
    "mm_proposals": 0,
    "total": 6
  }
}
```

**Prefer deactivating** (`PATCH` with `"is_active": false`) instead of delete for sectors with data.

---

## 9. Errors

| Status | When |
|--------|------|
| `400` | Missing/empty name, no fields to update |
| `401` | No token |
| `403` | Not admin (`admin` / `super_admin`) |
| `404` | Sector id not found |
| `409` | Duplicate name, or delete while in use |

---

## 10. Suggested Admin UI

```
Settings → Sectors

[ + Add sector ]

| Name                              | Order | Active | Proposals | Users | Actions      |
|-----------------------------------|-------|--------|-----------|-------|--------------|
| Meat & Poultry Industry           | 4     | Yes    | 12        | 1     | Edit Delete  |
| Halal Food Export Corridor        | 11    | Yes    | 0         | 0     | Edit Delete  |

Edit modal:
  Name:       [________________]
  Sort order: [__]
  Active:     [x]
  [ Cancel ] [ Save ]

Delete:
  If usage.total > 0 → show warning, offer "Deactivate instead"
```

After create/update/delete, refresh:
- Local sectors table state
- Any cached dropdown options (`GET /api/sectors`)

---

## 11. Frontend example

```tsx
const API = import.meta.env.VITE_API_URL;

async function listAdminSectors(token: string) {
  const res = await fetch(`${API}/api/admin/sectors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

async function createSector(token: string, name: string, sortOrder?: number) {
  const res = await fetch(`${API}/api/admin/sectors`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, sort_order: sortOrder ?? 0 }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

async function deactivateSector(token: string, id: number) {
  const res = await fetch(`${API}/api/admin/sectors/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ is_active: false }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

// Dropdowns (any logged-in user)
async function loadSectorOptions(token: string) {
  const res = await fetch(`${API}/api/sectors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.sectors as string[];
}
```

---

## 12. Test checklist

1. Run `npm run db:migrate:sectors`
2. Login as `superadmin@test.com`
3. `GET /api/admin/sectors` → 10 sectors with usage counts
4. `POST /api/admin/sectors` → new sector appears in `GET /api/sectors`
5. `PATCH` deactivate → hidden from dropdown, still on old proposals
6. `DELETE` sector with proposals → `409`
7. Login as `partya@test.com` → `GET /api/sectors` works; `POST /api/admin/sectors` → `403`

---

## Related docs

- `STEP5_USER_MANAGEMENT_API.md` — user CRUD (super_admin)
- `CONFERENCE_FILTER_PAGINATION_FRONTEND.md` — proposal list filters (`sector` query param)

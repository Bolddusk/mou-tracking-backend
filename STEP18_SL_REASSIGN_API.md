# Step 18 — Sector Lead Reassign + Handoff (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Base path:** `/api/admin`  
**Auth:** `Authorization: Bearer <token>`  
**Role:** `super_admin` only

Super Admin can reassign open complaints and China matchmaking proposals from an old Sector Lead to a new one. Direct MOUS proposals (`proposals` table) are **sector-based** — new SL automatically sees the queue; no reassign needed.

---

## Setup (once)

```bash
cd investment-portal-backend
npm run db:migrate:sl-reassignments
npm run db:seed          # base users (superadmin, sectorlead, partya, investor)
npm run db:seed:sl-handoff   # orphans + reassign test data
npm run dev
```

### What `db:seed:sl-handoff` creates

| Item | Purpose |
|------|---------|
| `oldsl-handoff@test.com` | Old SL Agri — reassign test |
| `sectorlead@test.com` | New SL Agri |
| `orphan-sl-ref@test.com` | Demoted — Agri orphan |
| `oldsl-food@test.com` / `sectorlead-food@test.com` / `orphan-sl-food@test.com` | Food Processing pack |
| `oldsl-dairy@test.com` / `sectorlead-dairy@test.com` / `orphan-sl-dairy@test.com` | Dairy pack |

Refresh **Orphans** tab — expect **6 rows** (3 sectors × complaint + china). Reassign **each sector separately**.

---

## What gets reassigned

| Record | Field | Open statuses reassigned | Closed (audit kept) |
|--------|-------|--------------------------|---------------------|
| Complaints (active SL) | `tagged_sector_lead` | NOT `resolved`, `rejected` | `resolved`, `rejected` |
| Complaints (**orphans**) | `tagged_sector_lead` | Same sector, user missing or not `sector_lead` | Closed unchanged |
| China proposals (active SL) | `forwarded_to_sl` | NOT `approved`, `rejected` | `approved`, `rejected` |
| China proposals (**orphans**) | `forwarded_to_sl` | Same sector, invalid SL ref | Closed unchanged |
| Direct MOUS | `proposals.sector` | N/A — auto by sector string | N/A |

---

## APIs

### 1. Reassign Sector Lead

```
PATCH /api/admin/sector-lead/reassign
Authorization: Bearer <super_admin_token>
Content-Type: application/json
```

**Body:**

```json
{
  "sector": "Agri-chemicals & Inputs",
  "new_sl_user_id": 5,
  "reason": "Previous SL transferred to another department"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `sector` | Yes | Must match portal sector list |
| `new_sl_user_id` | Yes | User with `role = sector_lead` |
| `reason` | No | Stored in audit log |

**Validations:**
- New SL's `users.sector` must equal `body.sector`
- Transaction: update complaints + china proposals + insert audit log

**Response `200`:**

```json
{
  "message": "Sector Lead reassigned",
  "complaints_updated": 3,
  "china_proposals_updated": 1,
  "orphan_complaints_fixed": 1,
  "orphan_china_proposals_fixed": 1,
  "sector": "Agri-chemicals & Inputs",
  "new_sector_lead": {
    "id": 5,
    "full_name": "Hasnain Lodhi",
    "email": "sectorlead@test.com"
  },
  "previous_sector_lead_ids": [3]
}
```

**Errors:**

| Status | Error |
|--------|-------|
| `400` | Invalid sector / user not sector_lead / sector mismatch |
| `403` | Not super_admin |
| `500` | Transaction failed (rolled back) |

---

### 2. Reassignment history

```
GET /api/admin/sector-lead/reassignments
```

**Response `200`:**

```json
{
  "count": 2,
  "reassignments": [
    {
      "id": 1,
      "from_user_id": 3,
      "from_user_name": "Alam Zeb Khan",
      "from_user_email": "oldsl@test.com",
      "to_user_id": 5,
      "to_user_name": "Hasnain Lodhi",
      "to_user_email": "sectorlead@test.com",
      "sector": "Agri-chemicals & Inputs",
      "reason": "Department transfer",
      "reassigned_at": "2026-06-10T14:00:00.000Z",
      "reassigned_by": 1,
      "reassigned_by_name": "Super Admin"
    }
  ]
}
```

---

### 3. Orphan check

```
GET /api/admin/sector-lead/orphans
```

Finds records pointing to a user who **does not exist** or is **no longer** `sector_lead`.

**Response `200`:**

```json
{
  "orphan_complaints": [
    {
      "id": 12,
      "title": "Delay in approval",
      "status": "open",
      "tagged_sector_lead": 99,
      "tagged_user_name": null,
      "tagged_user_role": null
    }
  ],
  "orphan_china_proposals": [],
  "counts": {
    "orphan_complaints": 1,
    "orphan_china_proposals": 0
  }
}
```

Use this on Admin dashboard to show warnings before delete/reassign.

---

## Delete Sector Lead protection

`DELETE /api/users/:id` — if user is `sector_lead` with open assignments:

```json
{
  "error": "Cannot delete Sector Lead with open assignments",
  "open_complaints": 2,
  "open_china_proposals": 1,
  "message": "Please reassign via /api/admin/sector-lead/reassign first"
}
```

**Flow:** Reassign first → then delete old SL user.

---

## Sector list for dropdown

```
GET /api/users/sector-leads
```

Or profile sectors constant — pick SL where `sector` matches selected sector:

```
GET /api/users?role=sector_lead&search=...
```

(Create new SL via `POST /api/users` if none exists for sector — see `STEP5_USER_MANAGEMENT_API.md`)

---

## Super Admin UI pages

### Page 1: Reassign Sector Lead

Route: `/dashboard/super-admin/sector-lead/reassign`

```
┌─────────────────────────────────────────┐
│ Reassign Sector Lead                    │
├─────────────────────────────────────────┤
│ Sector:        [dropdown ▼]             │
│ New Sector Lead: [dropdown ▼]           │
│ Reason:        [textarea optional]      │
│ [Reassign]                              │
└─────────────────────────────────────────┘
```

On success show: `complaints_updated`, `china_proposals_updated`

### Page 2: Orphans + History

Route: `/dashboard/super-admin/sector-lead/handoff`

- Tab **Orphans** → `GET /orphans` — red badge if count > 0
- Tab **History** → `GET /reassignments` — table with from/to/date/reason

### Sidebar

Under **Admin**:
- Sector Lead Handoff
- (optional) link from User Management delete error

---

## Test (Postman)

1. Login `superadmin@test.com` / `password123`
2. `GET /api/admin/sector-lead/orphans`
3. `PATCH /api/admin/sector-lead/reassign` with sector + `new_sl_user_id`
4. `GET /api/admin/sector-lead/reassignments`
5. Try `DELETE /api/users/:oldSlId` — should work after reassign if no other references

---

## Frontend prompt (copy into Cursor)

```
Build Super Admin Sector Lead Handoff module.

Stack: React (Vite) + Tailwind, API http://localhost:5000
Follow STEP18_SL_REASSIGN_API.md

Routes:
- /dashboard/super-admin/sector-lead/reassign
- /dashboard/super-admin/sector-lead/handoff (orphans + history tabs)

Reassign page:
- Sector dropdown (use GET /api/profile/sectors or hardcode from STEP18 list)
- New Sector Lead dropdown: filter users where role=sector_lead and sector matches
  Use GET /api/users/sector-leads?sector=<encoded> or GET /api/users with role filter
- Optional reason textarea
- PATCH /api/admin/sector-lead/reassign on submit
- Success toast with complaints_updated + china_proposals_updated counts

Handoff page:
- Orphans tab: GET /api/admin/sector-lead/orphans
  - Tables for orphan_complaints and orphan_china_proposals
  - Red alert banner if any orphans exist + link to Reassign page
- History tab: GET /api/admin/sector-lead/reassignments
  - Table: from_user_name → to_user_name, sector, reason, reassigned_at, reassigned_by_name

User delete flow (User Management):
- If DELETE /api/users/:id returns open_complaints / open_china_proposals
  → show modal: "Reassign first" with link to reassign page

Super Admin only — 403 for other roles.
Green theme #006435.
```

---

## Related docs

- `STEP5_USER_MANAGEMENT_API.md` — create/delete users
- `STEP14_SUPER_ADMIN_MODULES.md` — admin module map
- `STEP4_COMPLAINTS_API.md` — complaints workflow

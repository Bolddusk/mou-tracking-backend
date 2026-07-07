# MOU Admin — Sector Change & Soft Delete (Frontend)

## Sector change (Super Admin / Admin)

**Already supported** via Edit MOU fields:

```
PATCH /api/proposals/:id/fields
{ "sector": "Fruits & Vegetables (...)" }
```

- Only `super_admin` / `admin` (`can_change_sector: true` on `GET /editable-fields`)
- Sector Lead **cannot** change sector
- After change, MOU automatically appears in the **new sector lead's** list (`GET /api/proposals/sector-lead` filters by `p.sector`)
- Old sector lead loses access (unless matchmaking `viaMatchmaking`)
- Change logged in **Change History** tab

**UI:** Sector dropdown enabled when `capabilities.can_change_sector === true`.

---

## Soft delete / archive (Super Admin / Admin)

Hard delete nahi — record database mein rehta hai, lists se hide.

### Migration (once)

```bash
npm run db:migrate:proposal-soft-delete
```

### Archive MOU

```
PATCH /api/proposals/:id/archive
```

**Body (optional):**

```json
{ "reason": "Duplicate entry" }
```

**Response:**

```json
{
  "message": "MOU archived successfully",
  "is_archived": true,
  "proposal": { "id": 278, "deleted_at": "...", "sector": "..." }
}
```

### Restore MOU

```
PATCH /api/proposals/:id/restore
```

### Capabilities (`GET /api/proposals/:id`)

```json
{
  "capabilities": {
    "can_change_sector": true,
    "can_archive_proposal": true,
    "can_restore_proposal": false
  },
  "is_archived": false
}
```

| Flag | Who | When |
|------|-----|------|
| `can_change_sector` | SA / Admin | MOU not archived |
| `can_archive_proposal` | SA / Admin | Not draft, not already archived |
| `can_restore_proposal` | SA / Admin | `is_archived === true` |

### List behaviour

| UI filter | API query |
|-----------|-----------|
| Active only (default) | *(no param)* |
| Include archived | `?include_deleted=1` |
| **Archived only** | `?archived_only=1` or `?archive_filter=archived_only` |

**Note:** `archived_only=1` works alone — `include_deleted` not required.

| Endpoint | Archived MOUs |
|----------|----------------|
| `GET /api/proposals/all` | Hidden by default |
| `GET /api/proposals/all?include_deleted=1` | SA/Admin sees active + archived |
| `GET /api/proposals/all?archived_only=1` | SA/Admin — archived only |
| `GET /api/proposals/sector-lead` | Never shows archived |

**Important:** Table column **MOU STATUS** (`Active` / `Inactive`) = operational status — **not** archive. Archived MOUs can still show `Active` there. Use `is_archived` / `deleted_at` for archive badge.

### Access after archive

- **Sector Lead / Party A / Party B** → `404` on detail (hidden)
- **Super Admin / Admin** → can still open archived MOU and restore

### UI suggestions

- **Delete** button → confirm modal → `PATCH .../archive` (label: "Archive MOU")
- Archived badge on detail when `is_archived`
- Admin list toggle: "Show archived"
- Restore button when `can_restore_proposal`

---

## Sector change + archive flow

```
Super Admin changes sector
        ↓
PATCH /fields { sector: "New Sector" }
        ↓
MOU moves to new Sector Lead queue
        ↓
Change History logs sector update
```

```
Super Admin archives MOU
        ↓
PATCH /archive
        ↓
Hidden from all lists (except admin include_deleted)
        ↓
Optional: PATCH /restore
```

# RBAC — Hierarchical Permission Bundles

**Status:** Implemented  
**Related:** `RBAC_BACKEND_15_PERMISSIONS.md`, `server/utils/permissionBundles.js`

---

## Problem

Granting only `nav.opportunities.all` opened the list page but `GET /api/proposals/:id` and `/activities` returned **403** because action permissions were missing.

## Solution

Each of the **15 sidebar `nav.*` keys** has a **permission bundle**: list APIs, detail APIs, and optional actions. Grant nav → auto-grant **minimum** action keys.

---

## API: Permission bundles catalog

```
GET /api/admin/rbac/permission-bundles
Authorization: Bearer <admin.rbac or nav.permissions.manage>
```

```json
{
  "bundles": [
    {
      "nav_key": "nav.opportunities.all",
      "label": "All Opportunities",
      "route": "/dashboard/super-admin",
      "list_apis": [
        { "method": "GET", "path": "/api/proposals/all", "permission": "proposals.list_all", "required": true },
        { "method": "GET", "path": "/api/proposals/filter-options", "permission": "proposals.filter_options", "required": true }
      ],
      "detail_apis": [
        { "method": "GET", "path": "/api/proposals/:id", "permission": "proposals.view", "required": true },
        { "method": "GET", "path": "/api/proposals/:proposalId/activities", "permission": "proposals.activities.view", "required": true }
      ],
      "actions": [
        { "permission": "proposals.approve", "label": "Approve proposal", "apis": [{ "method": "PATCH", "path": "/api/proposals/:id/approve" }] }
      ],
      "default_grant_on_nav": {
        "minimum": [
          "proposals.list_all",
          "proposals.filter_options",
          "proposals.view",
          "proposals.activities.view"
        ],
        "suggested": ["proposals.messages.view", "proposals.mou.view"]
      },
      "full_grant_on_nav": ["proposals.list_all", "proposals.filter_options", "proposals.view", "..."]
    }
  ],
  "sidebar_nav_count": 15
}
```

---

## API: Grant bundle

```
POST /api/admin/rbac/roles/:role/grant-bundle
Content-Type: application/json

{
  "nav_key": "nav.opportunities.all",
  "level": "minimum"
}
```

**Levels:** `minimum` | `full` | `custom` (with `permissions: []`)

**Example — Sector Lead + All Opportunities (minimum):**

```json
{
  "nav_key": "nav.opportunities.all",
  "level": "minimum"
}
```

Grants:
- `nav.opportunities.all`
- `proposals.list_all`
- `proposals.filter_options`
- `proposals.view`
- `proposals.activities.view`

---

## PATCH auto-expands minimum bundle

```
PATCH /api/admin/rbac/roles/sector_lead
{ "grant": ["nav.opportunities.all"] }
```

Same minimum action keys are **auto-granted** (no separate grant-bundle call needed).

---

## Canonical action keys (proposals)

| Permission | API |
|------------|-----|
| `proposals.list_all` | `GET /api/proposals/all` |
| `proposals.list_sector` | `GET /api/proposals/sector-lead` |
| `proposals.filter_options` | `GET /api/proposals/filter-options` |
| `proposals.view` | `GET /api/proposals/:id` |
| `proposals.activities.view` | `GET /api/proposals/:proposalId/activities` |
| `proposals.activities.create` | `POST /api/proposals/:proposalId/activities` |
| `proposals.messages.view` | `GET /api/proposals/:proposalId/messages` |
| `proposals.approve` | `PATCH /api/proposals/:id/approve` |

**Legacy aliases (DB migration):** `proposals.view_detail`, `proposals.view_own` → `proposals.view`

---

## Matchmaking action keys

| Permission | API |
|------------|-----|
| `matchmaking.list_my` | `GET /api/matchmaking/proposals/my` |
| `matchmaking.list_review_queue` | `GET /api/matchmaking/proposals/focal-point` |
| `matchmaking.list_forwarded` | `GET /api/matchmaking/proposals/forwarded-to-me` |
| `matchmaking.list_board` | `GET /api/matchmaking/proposals/all-for-matching` |
| `matchmaking.view` | `GET /api/matchmaking/proposals/:id` |
| `matchmaking.view_matches` | `GET /api/matchmaking/matches/matched` |
| `matchmaking.view_match_detail` | `GET /api/matchmaking/matches/:id` |

---

## Complaints action keys

| Permission | API |
|------------|-----|
| `complaints.list_all` | `GET /api/complaints/all` |
| `complaints.list_own` | `GET /api/complaints/my` |
| `complaints.list_sector` | `GET /api/complaints/sector` |
| `complaints.view` | `GET /api/complaints/:id` |

---

## Test checklist

1. Grant Sector Lead `nav.opportunities.all` via PATCH → also gets `proposals.view`, `proposals.activities.view`
2. `GET /api/proposals/:id` → **200** (scope still enforced in controller)
3. `GET /api/proposals/:id/activities` → **200**
4. Revoke `proposals.view` only → detail **403**, list still works
5. `POST grant-bundle` with `level: "full"` → all action keys in bundle granted

```bash
npm run db:sync:role-permissions
```

---

## One-liner

> Nav key = sidebar link + minimum action bundle. Use `GET /permission-bundles` for mapping; grant via `PATCH` (auto-minimum) or `POST grant-bundle`.

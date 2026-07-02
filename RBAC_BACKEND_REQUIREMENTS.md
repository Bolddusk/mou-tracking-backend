# RBAC Backend Requirements

**Status:** Implemented in `server/utils/navCatalog.js` + `server/utils/rolePermissions.js`

---

## Core rule

**Before:** Per-role `NAVIGATION_BY_ROLE` templates — same permissions could yield different sidebars.

**After:** One global `NAV_CATALOG`. Navigation = catalog items where `user.permissions` includes `item.permission` (with legacy alias expansion).

```
navigation = NAV_CATALOG.filter(item => permissionGranted(permissions, item.permission))
```

Role is for **data scope** (`context.scoped_sector`, `context.scoped_country`) — not sidebar templates.

---

## Auth APIs — `rbac` object

`POST /api/auth/login`, `GET /api/auth/me`, `GET /api/auth/permissions`

```json
{
  "redirect": "/dashboard/sector-lead",
  "rbac": {
    "role": "sector_lead",
    "role_label": "Sector Lead",
    "permissions": ["nav.mous.sector", "..."],
    "navigation": [
      {
        "section": "OVERVIEW",
        "items": [
          { "key": "mous_sector", "label": "MOUs (my sector)", "path": "/dashboard/sector-lead", "permission": "nav.mous.sector" }
        ]
      }
    ],
    "redirect": "/dashboard/sector-lead",
    "context": {
      "sector": "Agri-chemicals & Inputs",
      "scoped_sector": "Agri-chemicals & Inputs",
      "scoped_country": null,
      "country": null
    },
    "source": "database"
  }
}
```

| Field | Behaviour |
|-------|-----------|
| `permissions` | Role grants from DB (admin PATCH/PUT reflected on next `/me`) |
| `navigation` | Built from global catalog ∩ permissions |
| `redirect` | First nav item path (or change-password if `must_change_password`) |
| `context` | `sector_lead` → `scoped_sector`; `regional_focal_point` → `scoped_country` |

**Grant `nav.users.manage` → Users appears in navigation** (no role template required).

---

## Global nav catalog

File: `server/utils/navCatalog.js`

Each entry: `key`, `label`, `path`, `permission`, `section`, `order`. Optional `pathByRole` for profile list paths.

Canonical frontend paths:

| Permission | Path |
|------------|------|
| `nav.opportunities.all` | `/dashboard/super-admin` |
| `nav.mous.all` | `/dashboard/super-admin` |
| `nav.mous.sector` | `/dashboard/sector-lead` |
| `nav.proposals.my` | `/dashboard/party-a` |
| `nav.proposals.party_b` | `/dashboard/party-b` |
| `nav.matchmaking.my_proposals` | `/matchmaking/my-proposals` |
| `nav.matchmaking.new_proposal` | `/matchmaking/new` |
| `nav.proposals.new_direct` | `/proposals/new` |
| `nav.matchmaking.review_queue` | `/matchmaking/focal-point` |
| `nav.matchmaking.forwarded` | `/matchmaking/forwarded` |
| `nav.matchmaking.matching_board` | `/matchmaking/board` |
| `nav.matchmaking.all_matches` | `/matchmaking/matches` |
| `nav.matchmaking.all_proposals` | `/matchmaking/admin/my-proposals` |
| `nav.complaints.all` | `/complaints` |
| `nav.complaints.mine` | `/complaints` |
| `nav.complaints.sector` | `/complaints` |
| `nav.profiles.party_a` | sector/super-admin profile list paths |
| `nav.profiles.party_b` | sector/super-admin profile list paths |
| `nav.users.manage` | `/admin/users` |
| `nav.sectors.manage` | `/admin/sectors` |
| `nav.permissions.manage` | `/admin/permissions` |
| `nav.sector_lead.reassign` | `/dashboard/super-admin/sector-lead/handoff` |
| `nav.compliance.audit` | `/dashboard/super-admin/compliance` |
| `nav.account.change_password` | `/auth/change-password` |
| `nav.profile.party_a` | `/dashboard/party-a/profile` |
| `nav.profile.party_b` | `/dashboard/party-b/profile` |

### Legacy permission aliases (DB backward compat)

| Legacy | Canonical |
|--------|-----------|
| `nav.proposals.new` | `nav.proposals.new_direct` |
| `nav.complaints.own` | `nav.complaints.mine` |
| `nav.profile.party_a_list` | `nav.profiles.party_a` |
| `nav.profile.party_b_list` | `nav.profiles.party_b` |
| `nav.matchmaking.matches` | `nav.matchmaking.all_matches` |

Run `npm run db:sync:role-permissions` to upsert catalog + migrate legacy grants.

---

## Permission catalog API

`GET /api/admin/rbac/permissions`

```json
{
  "permissions": [
    { "key": "nav.users.manage", "label": "Users", "group": "nav", "type": "nav", "route": "/admin/users" }
  ],
  "groups": [
    { "key": "nav", "label": "Navigation", "permissions": [ "..."] },
    { "key": "proposals", "label": "Proposals", "permissions": [ "..."] }
  ]
}
```

---

## Admin role APIs

`GET /api/admin/rbac/roles/:role` — includes computed `navigation`.

`PUT` / `PATCH` — response includes updated `navigation` (same algorithm as `/me`).

---

## API enforcement

Middleware: `server/middleware/requirePermission.js`

| Endpoint | Permission(s) |
|----------|----------------|
| `GET /api/users` | `nav.users.manage` OR `users.list` |
| `DELETE /api/users/:id` | `users.delete` |
| `GET /api/proposals/sector-lead` | `nav.mous.sector` OR `proposals.list_sector` |
| `GET /api/proposals/all` | `nav.mous.all` OR `proposals.list_all` |
| `PATCH /api/proposals/:id/approve` | `proposals.approve` |
| `GET /api/admin/rbac/*` | `nav.permissions.manage` OR `admin.rbac` |

`super_admin`: middleware bypass (option A) — still receives full permissions array from DB.

Data scope remains in controllers (e.g. sector lead list filters by `req.user.sector`).

---

## Proposal capabilities

`GET /api/proposals/:id` → `capabilities.can_approve`, `can_reject`, etc. from permissions + proposal state + sector scope.

---

## Default role seeds

See `ROLE_PERMISSIONS` in `server/utils/rolePermissions.js`. Editable via admin APIs.

---

## Acceptance tests

1. Grant `sector_lead` → `nav.users.manage` → `/me` navigation includes Users at `/admin/users`
2. Revoke → Users gone; `GET /api/users` → 403
3. Super Admin + Sector Lead navigation built with **same algorithm** — count depends on grants only
4. `PATCH` role permissions → `GET /api/auth/permissions` returns updated nav

---

## Frontend integration

See `RBAC_FRONTEND.md`.

# RBAC — Backend Improvements

**Status:** Implemented (backend source of truth for nav dedupe, admin↔nav mapping, API enforcement).

**Related:** `RBAC_BACKEND_REQUIREMENTS.md`, `RBAC_FRONTEND.md`, `server/utils/navCatalog.js`, `server/utils/rolePermissions.js`

---

## 1. Deduplicate `navigation` at build time — DONE

`buildNavigationFromPermissions()` uses `normalizeNavPath()` — trim trailing slash, lowercase — and skips duplicate paths across sections (first `order` wins).

**Example:** Super Admin no longer gets duplicate `/dashboard/super-admin` (All Opportunities + MOUs all) or triple `/complaints`.

---

## 2. Map `admin.*` action keys to nav catalog entries — DONE

`ADMIN_NAV_GRANTS` in `rolePermissions.js`:

| Action / admin key | Nav key | Path |
|--------------------|---------|------|
| `admin.rbac` | `nav.permissions.manage` | `/admin/permissions` |
| `admin.sectors` | `nav.sectors.manage` | `/admin/sectors` |
| `admin.compliance` | `nav.compliance.audit` | `/dashboard/super-admin/compliance` |
| `admin.sl_reassign` | `nav.sector_lead.reassign` | `/dashboard/super-admin/sector-lead/handoff` |
| `admin.users` | `nav.users.manage` | `/admin/users` |

Grant `admin.rbac` only → Permissions link appears in `navigation`.

---

## 3. Prune redundant nav for broad roles — DONE

`NAV_PRUNE_RULES`:

| Has | Omit from navigation |
|-----|----------------------|
| `nav.mous.all` | `nav.mous.sector` |
| `nav.opportunities.all` | `nav.mous.sector` |

---

## 4. Enforce permissions on admin APIs — DONE

| Endpoint | Required permission (any) |
|----------|---------------------------|
| `GET/PUT/PATCH /api/admin/rbac/*` | `admin.rbac` or `nav.permissions.manage` |
| `/api/admin/sectors` | `admin.sectors` or `nav.sectors.manage` |
| `GET/POST /api/users` | `admin.users` or `nav.users.manage` or `users.list` |
| Compliance admin routes | `admin.compliance` or `nav.compliance.audit` |
| Sector lead reassign | `admin.sl_reassign` or `nav.sector_lead.reassign` |

`super_admin` middleware bypass remains for legacy; permission grants control non–super-admin access.

---

## 5. Stable `GET /api/auth/me` payload — DONE

Login, `/me`, and `/permissions` return:

- Root `redirect` (= first nav path or change-password)
- `rbac.permissions`, `rbac.navigation` (deduped + pruned), `rbac.context`, `rbac.redirect`

`GET /api/auth/permissions` → `{ redirect, rbac }` (same `rbac` shape as login/me).

---

## 6. Canonical matchmaking paths — DONE

| Feature | Canonical path in `navCatalog.js` |
|---------|-----------------------------------|
| All MM proposals | `/matchmaking/all` |
| Matching board | `/matchmaking/board` |
| Forwarded | `/matchmaking/forwarded` |
| Review queue | `/matchmaking/focal-point` |
| Matches | `/matchmaking/matches` |

---

## Test checklist

1. **Super Admin** login → no duplicate paths; shorter OVERVIEW section.
2. Grant **Party A** only `admin.rbac` → `navigation` includes Permissions; `PATCH /api/admin/rbac/roles/party_a` → 200.
3. Revoke `admin.rbac` → Permissions gone; RBAC API → 403.
4. **Sector Lead** default → no Users; grant `nav.users.manage` → Users in nav + `GET /api/users` 200.
5. `PATCH` role permissions → `GET /api/auth/permissions` → updated `navigation` without re-login.

```bash
npm run db:sync:role-permissions   # if new keys (admin.users) missing from DB
```

---

## One-liner for backend team

> Dedupe nav paths at source, map `admin.*` to nav catalog entries, enforce same keys on APIs, and use canonical `/matchmaking/*` paths in the catalog. **All done in `rolePermissions.js` + `navCatalog.js`.**

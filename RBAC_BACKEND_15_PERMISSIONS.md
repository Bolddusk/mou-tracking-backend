# RBAC — 15 Sidebar Permissions Only

**Status:** Implemented in `server/utils/navCatalog.js` + `server/utils/rolePermissions.js`

**Frontend + backend use the same 15 keys.**

Catalog source (frontend): `src/constants/sidebarPermissions.js`  
Permissions admin UI: `/admin/permissions` — only these 15 checkboxes.

---

## The 15 permissions (complete list)

| # | Section | UI label | Permission key | Route |
|---|---------|----------|----------------|-------|
| 1 | OVERVIEW | All Opportunities | `nav.opportunities.all` | `/dashboard/super-admin` |
| 2 | PROPOSALS | New Direct MOU | `nav.proposals.new_direct` | `/proposals/new` |
| 3 | MATCHMAKING | My Proposals | `nav.matchmaking.my_proposals` | `/matchmaking/my-proposals` |
| 4 | MATCHMAKING | New Proposal | `nav.matchmaking.new_proposal` | `/matchmaking/new` |
| 5 | MATCHMAKING | Review Queue | `nav.matchmaking.review_queue` | `/matchmaking/focal-point` |
| 6 | MATCHMAKING | Forwarded | `nav.matchmaking.forwarded` | `/matchmaking/forwarded` |
| 7 | MATCHMAKING | Matching Board | `nav.matchmaking.matching_board` | `/matchmaking/board` |
| 8 | MATCHMAKING | Matches | `nav.matchmaking.all_matches` | `/matchmaking/matches` |
| 9 | COMPLAINTS | All Complaints | `nav.complaints.all` | `/complaints` |
| 10 | ADMINISTRATION | Users | `nav.users.manage` | `/admin/users` |
| 11 | ADMINISTRATION | Sectors | `nav.sectors.manage` | `/admin/sectors` |
| 12 | ADMINISTRATION | Permissions | `nav.permissions.manage` | `/admin/permissions` |
| 13 | ADMINISTRATION | Sector Officer Change | `nav.sector_lead.reassign` | `/dashboard/super-admin/sector-lead/handoff` |
| 14 | ADMINISTRATION | Audit & Annual Returns | `nav.compliance.audit` | `/dashboard/super-admin/compliance` |
| 15 | ACCOUNT | Change Password | `nav.account.change_password` | `/auth/change-password` |

---

## Admin action aliases (same sidebar item)

Grant **either** nav or admin key — frontend treats as equivalent:

| Nav key | Admin alias |
|---------|-------------|
| `nav.permissions.manage` | `admin.rbac` |
| `nav.sectors.manage` | `admin.sectors` |
| `nav.compliance.audit` | `admin.compliance` |
| `nav.sector_lead.reassign` | `admin.sl_reassign` |
| `nav.users.manage` | `admin.users` |

Legacy complaint / matchmaking action keys may still grant the matching nav item on frontend (`complaints.review` → Complaints link, etc.) but **role defaults and admin UI should use the 15 nav keys above**.

---

## What backend must do

### 1. Role permissions = subset of these 15 (+ action keys optional)

- **Sidebar:** only grant/revoke the 15 `nav.*` keys (or admin aliases for admin items).
- **Action keys** (`proposals.approve`, `users.delete`, …) stay separate — they control buttons/API, **not** sidebar.
- Remove obsolete nav keys from default role seeds: `nav.mous.sector`, `nav.mous.all`, `nav.profiles.party_a`, `nav.matchmaking.all_proposals`, etc.

### 2. Build `rbac.navigation` from the same 15-item catalog

```js
// Pseudocode — same for every role
for (const item of SIDEBAR_CATALOG_15) {
  if (roleHasPermission(item.permission)) {
    navigation.add(item)
  }
}
```

Do **not** send extra items (Party A Profiles, MOUs my sector, Matchmaking Oversight, duplicate My Proposals).

### 3. Default grants per role (suggested)

| Role | Suggested sidebar keys |
|------|------------------------|
| `super_admin` | all 15 |
| `admin` | `nav.sectors.manage`, `nav.account.change_password` |
| `sector_lead` | `nav.matchmaking.forwarded`, `nav.matchmaking.matching_board`, `nav.matchmaking.all_matches`, `nav.complaints.all`, `nav.account.change_password` |
| `regional_focal_point` | `nav.matchmaking.review_queue`, `nav.matchmaking.forwarded`, `nav.matchmaking.matching_board`, `nav.account.change_password` |
| `focal_point` | `nav.matchmaking.review_queue`, `nav.matchmaking.matching_board`, `nav.account.change_password` |
| `party_a` | `nav.proposals.new_direct`, `nav.matchmaking.my_proposals`, `nav.matchmaking.new_proposal`, `nav.complaints.all`, `nav.account.change_password` |
| `party_b` | `nav.complaints.all`, `nav.account.change_password` |
| `investor` | `nav.matchmaking.my_proposals`, `nav.matchmaking.new_proposal`, `nav.matchmaking.all_matches`, `nav.account.change_password` |

Adjust via `PATCH /api/admin/rbac/roles/:role` — UI shows **X of 15**.

### 4. APIs

| API | Behaviour |
|-----|-----------|
| `GET /api/auth/me` | `rbac.permissions` + `rbac.navigation` (max 15 items, deduped) |
| `GET /api/auth/permissions` | Same `rbac` shape |
| `GET /api/admin/rbac/roles/:role` | `permissions` array; navigation preview from 15 catalog |
| `PATCH /api/admin/rbac/roles/:role` | `{ "grant": ["nav...."] }` / `{ "revoke": [...] }` |
| `PUT /api/admin/rbac/roles/:role` | Replace nav keys only; preserve action permissions if sent |

### 5. API route guards

Enforce the same keys as frontend (see `RBAC_BACKEND_TODO.md` §4).

---

## Frontend behaviour (already implemented)

- Sidebar built from **15-item catalog** ∩ `rbac.permissions` — **all roles**, not only super admin.
- Backend `navigation` from API is **ignored** for sidebar render (catalog is source of truth).
- Permissions page: only 15 checkboxes; role list shows `X/15`.

---

## Migration

```bash
npm run db:sync:role-permissions
```

- Add missing 15 keys to catalog.
- Strip obsolete nav keys from role defaults.
- Do not revoke custom admin changes to action permissions.

---

## Test checklist

1. **Super Admin** — 15/15 sidebar items; no Party Profiles, no Matchmaking Oversight.
2. **Sector Lead** — only granted items (e.g. Forwarded, Board, Matches, Complaints) — not full super-admin menu.
3. Grant Sector Lead `nav.users.manage` → Users appears; revoke → gone.
4. `GET /api/auth/me` navigation length ≤ 15, matches visible sidebar.
5. Party A — no Users/Permissions unless explicitly granted.

---

## One-liner

> **Sidebar = exactly 15 `nav.*` keys. Roles get a subset. Action permissions are separate. Navigation API must not emit anything outside this list.**

# Role Permissions — Frontend Integration

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Har **role** ki fixed **permissions** list backend se aati hai. Frontend sidebar, pages aur buttons isi se dikhaye.

**No migration for nav refactor.** Nav catalog: `server/utils/navCatalog.js`. Permissions: `server/utils/rolePermissions.js`

Full spec: `RBAC_BACKEND_REQUIREMENTS.md`

---

## APIs

| API | Kaam |
|-----|------|
| `POST /api/auth/login` | `rbac` object included |
| `GET /api/auth/me` | `rbac` refresh |
| `GET /api/auth/permissions` | Sirf rbac (lightweight) |
| `GET /api/auth/rbac/catalog` | Saari roles ki matrix (**super_admin** only) |

---

## Login response

```json
{
  "token": "...",
  "user": {
    "id": 1,
    "role": "super_admin",
    "role_label": "Super Admin"
  },
  "redirect": "/dashboard/super-admin",
  "rbac": {
    "role": "super_admin",
    "role_label": "Super Admin",
    "permissions": ["nav.opportunities.all", "nav.users.manage", "..."],
    "navigation": [
      {
        "section": "SUPER ADMIN",
        "items": [
          { "key": "opportunities_all", "label": "All Opportunities", "path": "/dashboard/super-admin", "permission": "nav.opportunities.all" },
          { "key": "mous_all", "label": "MOUs", "path": "/dashboard/super-admin/mous", "permission": "nav.mous.all" }
        ]
      },
      {
        "section": "MATCHMAKING OVERSIGHT",
        "items": [
          { "key": "mm_all_proposals", "label": "All Proposals", "path": "/matchmaking/all", "permission": "nav.matchmaking.all_proposals" }
        ]
      },
      {
        "section": "ADMINISTRATION",
        "items": [
          { "key": "users", "label": "Users", "path": "/admin/users", "permission": "nav.users.manage" },
          { "key": "sectors", "label": "Sectors", "path": "/admin/sectors", "permission": "nav.sectors.manage" }
        ]
      }
    ],
    "context": {
      "sector": null,
      "country": null,
      "scoped_sector": null,
      "scoped_country": null
    },
    "redirect": "/dashboard/super-admin"
  }
}
```

`navigation` **pehle se filtered** hai — global catalog ∩ `permissions`.

## Navigation algorithm (v2)

```
NAV_CATALOG (all roles, one list)
  → filter: user has item.permission (legacy aliases supported)
  → group by section, sort by order
  → sidebar
```

| Layer | Kya decide karta hai |
|-------|----------------------|
| `permissions[]` | Buttons, API guards, `can('proposals.approve')` |
| `navigation[]` | Sidebar — **sirf** granted `nav.*` keys jo catalog mein mapped hain |
| `context` | Data scope (sector / country) — UI template nahi |

**Grant `nav.users.manage` → Users sidebar link automatically** (koi role template nahi).

Legacy keys (`nav.complaints.own`, `nav.profile.party_a_list`, etc.) ab bhi kaam karte hain — canonical keys par alias hain.

---

## Frontend helper

```tsx
// authStore.ts
let rbac: RbacPayload | null = null;

export function setRbac(next: RbacPayload) {
  rbac = next;
}

export function can(permission: string): boolean {
  if (!rbac) return false;
  if (rbac.role === 'super_admin') return true;
  return rbac.permissions.includes(permission);
}

export function getNavigation() {
  return rbac?.navigation ?? [];
}
```

### Sidebar (screenshot jaisa)

```tsx
{getNavigation().map((section) => (
  <div key={section.section}>
    <p className="sidebar-section">{section.section}</p>
    {section.items.map((item) => (
      <NavLink key={item.key} to={item.path}>
        {item.label}
      </NavLink>
    ))}
  </div>
))}
```

### Route guard

```tsx
function RequirePermission({ permission, children }) {
  if (!can(permission)) return <Navigate to="/unauthorized" replace />;
  return children;
}

// Users page
<Route path="/admin/users" element={
  <RequirePermission permission="nav.users.manage">
    <UsersPage />
  </RequirePermission>
} />
```

### App boot

```tsx
useEffect(() => {
  const token = localStorage.getItem('token');
  if (!token) return;
  api.get('/api/auth/me').then(({ data }) => {
    setUser(data.user);
    setRbac(data.rbac);
  });
}, []);
```

---

## Roles summary

| Role | Sidebar highlights |
|------|-------------------|
| `super_admin` | All Opportunities, MOUs, Matchmaking oversight, Users, Sectors, SL reassign, Compliance |
| `sector_lead` | Permissions-driven — default: MOUs, Forwarded, Board, Matches, Complaints, profiles |
| `party_a` | My Proposals, New Opportunity, Complaints, Profile |
| `party_b` | My Proposals, Complaints, Profile |
| `investor` | Engagements, New Proposal (MM), Profile |
| `focal_point` | Review Queue, Matching Board |
| `regional_focal_point` | Review Queue, Forwarded, Matching Board |
| `admin` | Sectors only |

---

## Permission keys (nav — sidebar)

| Key | UI label |
|-----|----------|
| `nav.opportunities.all` | All Opportunities |
| `nav.mous.all` | MOUs (super admin) |
| `nav.mous.sector` | MOUs (sector lead) |
| `nav.matchmaking.all_proposals` | All Proposals |
| `nav.matchmaking.new_proposal` | New Proposal |
| `nav.matchmaking.review_queue` | Review Queue |
| `nav.matchmaking.forwarded` | Forwarded |
| `nav.matchmaking.matching_board` | Matching Board |
| `nav.matchmaking.all_matches` | Matches |
| `nav.matchmaking.matches` | Matches (legacy alias) |
| `nav.permissions.manage` | Permissions admin |
| `nav.proposals.party_b` | My Proposals (Party B) |
| `nav.proposals.new_direct` | New Direct MOU |
| `nav.complaints.mine` | My Complaints |
| `nav.profiles.party_a` | Party A Profiles (list) |
| `nav.profiles.party_b` | Party B Profiles (list) |
| `nav.complaints.all` | All Complaints |
| `nav.users.manage` | Users |
| `nav.sectors.manage` | Sectors |
| `nav.sector_lead.reassign` | Sector Officer Change |
| `nav.compliance.audit` | Audit & Annual Returns |
| `nav.account.change_password` | Change Password |

Action permissions (buttons): `proposals.approve`, `users.delete`, `proposals.edit_contacts`, etc. — full list in `GET /api/auth/rbac/catalog`.

---

## Row-level actions (proposal detail)

List/nav = `rbac.permissions`.  
**Per MOU buttons** = `GET /api/proposals/:id` → `capabilities`:

```json
{
  "capabilities": {
    "can_edit_party_contacts": true,
    "can_upload_mou": true,
    "can_close_deal": false
  }
}
```

Example: `can('proposals.approve')` + `capabilities` on row.

---

## Super admin catalog

```
GET /api/auth/rbac/catalog
```

Returns all 9 roles with `permissions` + `navigation` + `permission_catalog` — useful for docs/debug.

---

## Frontend prompt (Cursor)

```
Wire role permissions from backend.

Doc: RBAC_FRONTEND.md

1. On login: save data.rbac to global store (permissions + navigation)
2. On app load: GET /api/auth/me → refresh rbac
3. Sidebar: render rbac.navigation sections (SUPER ADMIN, MATCHMAKING OVERSIGHT, ADMINISTRATION)
4. Route guards: can('nav.users.manage') for /admin/users, etc.
5. Buttons: can('proposals.approve'), can('users.create')
6. Proposal row actions: use GET /api/proposals/:id capabilities
7. Do NOT hardcode role === 'super_admin' for sidebar — use navigation from API
8. After admin changes user role: GET /api/auth/permissions or re-login
```

---

## Admin: edit role permissions (Super Admin UI)

**Migration (once):** `npm run db:migrate:role-permissions`

**After code nav/permission updates:** `npm run db:sync:role-permissions` — adds missing catalog keys + default grants (does not revoke admin changes).

Permissions ab **database** mein hain. Super Admin UI se checkbox on/off kar sakte ho.

### APIs

| Method | Endpoint | Kaam |
|--------|----------|------|
| `GET` | `/api/admin/rbac/permissions` | Saari permission keys (catalog) |
| `GET` | `/api/admin/rbac/roles` | Har role + uski current permissions |
| `GET` | `/api/admin/rbac/roles/:role` | Ek role detail |
| `PUT` | `/api/admin/rbac/roles/:role` | **Poori list replace** |
| `PATCH` | `/api/admin/rbac/roles/:role` | **Add / remove** selected |

### Replace all permissions for a role

```
PUT /api/admin/rbac/roles/sector_lead
Authorization: Bearer <super_admin token>
Content-Type: application/json

{
  "permissions": [
    "nav.mous.sector",
    "proposals.list_sector",
    "proposals.approve",
    "proposals.reject"
  ]
}
```

### Add ya hatao (checkbox toggle)

```
PATCH /api/admin/rbac/roles/sector_lead
Content-Type: application/json

{
  "grant": ["proposals.export"],
  "revoke": ["proposals.deal_close"]
}
```

**Response:**

```json
{
  "message": "Role permissions patched",
  "role": "sector_lead",
  "permissions": ["..."],
  "granted": ["proposals.export"],
  "revoked": ["proposals.deal_close"]
}
```

### Permissions page UI flow

1. `GET /api/admin/rbac/permissions` → checkbox list (grouped)
2. `GET /api/admin/rbac/roles/sector_lead` → checked keys
3. User toggles checkbox → `PATCH` with `grant` or `revoke`
4. Ya Save All → `PUT` with full array

**Note:** Users with that role ko naya matrix tab milega jab `GET /api/auth/me` / re-login karein.

### Example: sector_lead ko export allow karo

```
PATCH /api/admin/rbac/roles/sector_lead
{ "grant": ["proposals.export"] }
```

### Example: sector_lead se approve hatao

```
PATCH /api/admin/rbac/roles/sector_lead
{ "revoke": ["proposals.approve", "proposals.reject"] }
```

---

## Change permissions (summary)

| Kya change | Kaise |
|------------|--------|
| **User ko zyada/kam access** | Users page → role change |
| **Role ki permissions add/remove** | `PATCH /api/admin/rbac/roles/:role` |
| **Role ki permissions poori set** | `PUT /api/admin/rbac/roles/:role` |
| **Nayi permission key add** | Dev: `rolePermissions.js` catalog + migration seed |

---

## Test

1. Login `superadmin@test.com` → navigation has Users, Sectors, All Complaints
2. Login `sectorlead@test.com` → no Users; has MOUs + sector scope
3. Login `partya@test.com` → New Opportunity; no admin items
4. `GET /api/auth/permissions` → same rbac as login
5. `PATCH /api/admin/rbac/roles/sector_lead` `{ "grant": ["proposals.export"] }` → sector lead ko export mile

# RBAC — List vs Detail Scope Mismatch (All Opportunities)

**Status:** Implemented — role-aware `nav.opportunities.all` minimum bundle + `rbac.context.proposals_list_api`

**Problem:** Sector Lead / Party A ko `nav.opportunities.all` dene par list mein **bahut zyada MOUs** dikhte hain, lekin click par **403 Permission Denied**.

**Root cause:** Minimum bundle sab ko `proposals.list_all` deta hai → `GET /api/proposals/all` **cross-sector** data return karta hai. Detail `GET /api/proposals/:id` **role scope** enforce karta hai (sector / own only) → list ≠ detail.

---

## Required backend fix

### Rule (must)

> **Jo MOU list mein dikhe, woh detail open ho sake.** List API aur detail API **same scope rule** use karein.

| Role | List API | Permission key | Scope |
|------|----------|----------------|-------|
| `super_admin` | `GET /api/proposals/all` | `proposals.list_all` | All sectors |
| `sector_lead` | `GET /api/proposals/sector-lead` | `proposals.list_sector` | `scoped_sector` only |
| `party_a` | `GET /api/proposals/my` | `proposals.list_own` | Own proposals only |
| `party_b` | `GET /api/proposals/my` | `proposals.list_own` | Own / linked proposals |

**Do NOT** grant `proposals.list_all` to non–super-admin roles when granting `nav.opportunities.all`.

---

## 1. Role-aware minimum bundle

Update `permissionBundles.js` — `nav.opportunities.all` → `default_grant_on_nav.minimum` **per role**:

```json
{
  "nav_key": "nav.opportunities.all",
  "default_grant_on_nav": {
    "by_role": {
      "super_admin": ["proposals.list_all", "proposals.filter_options", "proposals.view", "proposals.activities.view"],
      "sector_lead": ["proposals.list_sector", "proposals.filter_options", "proposals.view", "proposals.activities.view"],
      "party_a": ["proposals.list_own", "proposals.filter_options", "proposals.view", "proposals.activities.view"],
      "party_b": ["proposals.list_own", "proposals.filter_options", "proposals.view", "proposals.activities.view"]
    }
  }
}
```

`PATCH grant: ["nav.opportunities.all"]` → expand **role-specific** minimum, not global `list_all`.

---

## 2. OR scope `GET /api/proposals/all` server-side

Agar ek hi list endpoint rakhna hai:

- `GET /api/proposals/all` — permission check ke baad **auto-filter by role**:
  - `super_admin` → no filter
  - `sector_lead` → `WHERE sector = user.scoped_sector`
  - `party_a` / `party_b` → own proposals only
- `proposals.list_all` rename / restrict to **super_admin only**

---

## 3. `GET /api/auth/me` — tell frontend which list to use

```json
{
  "rbac": {
    "context": {
      "list_scope": "all",
      "scoped_sector": null
    },
    "capabilities": {
      "proposals_list_api": "/api/proposals/all"
    }
  }
}
```

Examples:
- `super_admin` → `list_scope: "all"`, api `/api/proposals/all`
- `sector_lead` → `list_scope: "sector"`, api `/api/proposals/sector-lead`
- `party_a` → `list_scope: "own"`, api `/api/proposals/my`

Frontend already uses role-based list (interim fix). Backend should align permissions + bundle grants.

---

## 4. New permission keys (if missing)

| Key | Endpoint |
|-----|----------|
| `proposals.list_own` | `GET /api/proposals/my` |
| `proposals.list_sector` | `GET /api/proposals/sector-lead` |
| `proposals.list_all` | `GET /api/proposals/all` — **super_admin only** |

Route guards:
- `/api/proposals/all` → require `proposals.list_all` **and** role `super_admin` (or cross-sector flag)
- `/api/proposals/sector-lead` → `proposals.list_sector`
- `/api/proposals/my` → `proposals.list_own`

---

## 5. Migration

For roles that already have `nav.opportunities.all` + `proposals.list_all` but are not super_admin:

```bash
npm run db:sync:role-permissions
```

- Revoke `proposals.list_all` from `sector_lead`, `party_a`, `party_b`
- Grant `proposals.list_sector` or `proposals.list_own` as appropriate

---

## Test checklist

1. **Sector Lead** + `nav.opportunities.all` → list = sirf apne sector ke MOU; har row open → **200**
2. **Party A** + `nav.opportunities.all` → list = sirf apne MOU; open → **200**
3. **Super Admin** → list = all sectors; open any → **200**
4. Sector Lead list mein doosre sector ka MOU **nahi** dikhna chahiye
5. Grant bundle minimum → role ke mutabiq sahi list permission, `list_all` nahi

---

## One-liner (backend ko bhejo)

> `nav.opportunities.all` ka minimum bundle role-aware karo: super_admin = `proposals.list_all`, sector_lead = `proposals.list_sector`, party_a/b = `proposals.list_own`. List aur detail same scope — list mein jo dikhe woh open ho. Abhi `list_all` sab ko mil raha hai lekin detail scoped hai is liye 403.

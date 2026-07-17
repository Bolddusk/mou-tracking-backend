# Companies Tab — Party A & Party B (each edits own side only)

**Backend ready** — use capabilities from `GET /api/proposals/:id`.

---

## 1. Show Companies tab

| Role | Show Companies? |
|------|-----------------|
| `super_admin` / `admin` / `sector_lead` | Yes |
| `party_a` (linked) | Yes — `can_view_companies` |
| `party_b` (linked) | Yes — `can_view_companies` |

```tsx
const showCompanies = proposal.capabilities?.can_view_companies === true;
```

Do **not** hide Companies for `party_a` or `party_b`.

---

## 2. Edit buttons — own side only

| Flag | UI |
|------|-----|
| `can_edit_party_a_contacts` | **Edit contacts** on Pakistani / Party A card |
| `can_edit_party_b_contacts` | **Edit contacts** on Chinese / Party B card |
| `can_edit_party_contacts` | Legacy staff flag — parties have this `false`; use split flags |

### Party A logged in

```json
{
  "can_view_companies": true,
  "can_edit_party_a_contacts": true,
  "can_edit_party_b_contacts": false,
  "can_edit_party_contacts": false
}
```

### Party B logged in

```json
{
  "can_view_companies": true,
  "can_edit_party_a_contacts": false,
  "can_edit_party_b_contacts": true,
  "can_edit_party_contacts": false
}
```

### Staff (SA / Admin / SL)

Both `can_edit_party_a_contacts` and `can_edit_party_b_contacts` → `true`.

```tsx
{caps.can_edit_party_a_contacts && <EditContactsButton side="a" />}
{caps.can_edit_party_b_contacts && <EditContactsButton side="b" />}
```

Other side stays **read-only** (no Edit button).

---

## 3. Save API

```
PATCH /api/proposals/:id/party-contacts
```

**Party A** — only own payload:

```json
{
  "party_a_info": {
    "organization_name": "MA Group Pakistan",
    "contact_name": "M. Zain Abid Mian",
    "email": "trustherb@outlook.com",
    "phone": "0300…",
    "country": "Pakistan",
    "city": "Lahore"
  }
}
```

**Party B** — only own payload:

```json
{
  "party_b_info": {
    "organization_name": "Shandong Yuanhexian…",
    "contact_name": "Cao Xiyuan",
    "email": "partner@example.com",
    "phone": "+86…",
    "country": "China",
    "city": ""
  }
}
```

Cross-side → `403` (`You cannot edit Party A/B contacts`).

---

## 4. Email must be login-valid

Invalid: `name@domain.com1122` → `400`  
Valid: `name@domain.com`

Credentials modal only when `party_a` / `party_b` response has `account_created && credentials` (see `EXISTING_PARTY_LINK_FRONTEND.md`).

---

## 5. Checklist

- [ ] Party A & Party B: Companies tab visible
- [ ] Party A: Edit only Pakistani card
- [ ] Party B: Edit only Chinese card
- [ ] PATCH body matches own side only
- [ ] Staff: edit both sides unchanged

---

## Related

- `COMPANIES_TAB_FRONTEND.md` — layout / display
- `PROPOSAL_PARTY_CONTACTS_FRONTEND.md` — full staff payload
- `EXISTING_PARTY_LINK_FRONTEND.md` — credentials vs existing account

# Companies Tab — Frontend Integration (Email + No Duplicate Rows)

**Backend updated:** emails normalized to lowercase (login format); proposal detail includes deduplicated contact rows.

---

## 1. One email everywhere (login email)

User may type `partyAAA@gmail.com` — backend saves and returns **`partyaaa@gmail.com`** everywhere.

| Field | Use for display |
|-------|-----------------|
| `party_a_info.email` | Pakistani side email (lowercase) |
| `party_b_email` | Chinese side email (lowercase) |
| `party_a_profile.data.user.email` | Same login email (lowercase) |
| `party_b_profile.data.user.email` | Same login email (lowercase) |
| `party_a_contacts_display.login_email` | Preferred single source for Party A |
| `party_b_contacts_display.login_email` | Preferred single source for Party B |

**Rule:** On Companies tab, **Proposal Contacts** and **Company Profile** must show the **same** email — use `login_email` or `party_a_info.email` / `party_b_email` (all lowercase now).

Do **not** show mixed case from old cached UI state — refetch `GET /api/proposals/:id` after save.

---

## 2. No repeated rows in Proposal Contacts

`GET /api/proposals/:id` now includes:

```json
{
  "party_a_contacts_display": {
    "login_email": "partyaaa@gmail.com",
    "items": [
      { "label": "Company", "value": "Biogas & Renewable Energy Technology" },
      { "label": "Email", "value": "partyaaa@gmail.com" }
    ]
  },
  "party_b_contacts_display": {
    "login_email": "partybbb@gmail.com",
    "items": [
      { "label": "Company", "value": "WAS Tech Solutions Ltd." },
      { "label": "Email", "value": "partybbb@gmail.com" },
      { "label": "Country", "value": "China" }
    ]
  }
}
```

Backend **removes duplicate values** (case-insensitive). If Company, Contact Person, and Organization are all the same text, only **one row** is returned.

### Frontend — replace manual field list

**Before (wrong):**
```tsx
// Don't render fixed list — causes Company / Contact / Organization x3 same text
<div>Company: {company_name}</div>
<div>Contact: {party_a_info.contact_name}</div>
<div>Organization: {party_a_info.organization_name}</div>
```

**After (correct):**
```tsx
const contacts = proposal.party_a_contacts_display?.items ?? [];
contacts.map((row) => (
  <div key={row.label}>
    <span>{row.label}</span>
    <span>{row.value}</span>
  </div>
));
```

Same for Party B with `party_b_contacts_display.items`.

---

## 3. Company Profile card

Show profile summary using **login email** (not a separate casing):

```tsx
const loginEmail =
  proposal.party_a_contacts_display?.login_email ||
  proposal.party_a_profile?.data?.user?.email ||
  proposal.party_a_info?.email;
```

Profile block email line → `{loginEmail}`

Party B:
```tsx
const loginEmailB =
  proposal.party_b_contacts_display?.login_email ||
  proposal.party_b_profile?.data?.user?.email ||
  proposal.party_b_email;
```

---

## 4. Edit contacts form

- User can still type mixed case in the input.
- On save (`PATCH /api/proposals/:id/party-contacts`), backend stores lowercase.
- After save, refetch proposal — UI shows lowercase everywhere.

Optional UX: normalize to lowercase in the input `onBlur` so user sees login email before save.

---

## 5. Companies tab layout (updated)

```
┌─ Pakistani Company ─────────────────────┐
│ PROPOSAL CONTACTS                         │
│   → render party_a_contacts_display.items │
│ COMPANY PROFILE                           │
│   name + login_email (same as above)      │
│ DOCUMENTS                                 │
└───────────────────────────────────────────┘
```

---

## 6. Test checklist

1. Save contacts with `partyAAA@gmail.com` → API returns `partyaaa@gmail.com`
2. Proposal Contacts email === Company Profile email
3. If company name = contact name = organization → only **one** row in `items`
4. Login works with lowercase email shown on screen

---

## Related

- `PARTY_PROFILES_FRONTEND.md` — profile completion
- `PROPOSAL_PARTY_CONTACTS_FRONTEND.md` — edit contacts API (symmetric `party_a_info` + `party_b_info`)

---

## Party B — exact JSON spec (`party_b_info`)

Same keys as `party_a_info`:

```json
{
  "entity_type": "business",
  "organization_name": "WAS Tech Solutions Ltd.",
  "department_ministry": "",
  "contact_name": "WAS Tech Solutions Ltd.",
  "designation": "",
  "email": "partybbb@gmail.com",
  "phone": "",
  "country": "China",
  "city": ""
}
```

**PATCH** `/api/proposals/:id/party-contacts`:

```json
{
  "party_a_info": { "...": "..." },
  "party_b_info": { "...": "..." }
}
```

**GET** `/api/proposals/:id` returns `party_b_info` plus synced legacy flat fields (`party_b_name`, `party_b_email`, …).

**Migration (once per environment):** `npm run db:migrate:party-b-info`

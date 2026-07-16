# Existing Party Account Link — Frontend

When the **same email** is added on a 2nd (or later) MOU, backend **links** the existing account. It does **not** create a new password or return credentials.

---

## Response shape (`party_a` / `party_b`)

Returned from:

- `PATCH /api/proposals/:id/party-contacts`
- `PATCH /api/proposals/:id/fields` (when contacts trigger provision)
- `PATCH /api/proposals/:id/approve`

### New account (first time)

```json
{
  "linked": true,
  "user_id": 61,
  "account_created": true,
  "existing_account": false,
  "email_sent": true,
  "credentials": {
    "email": "trustherb@outlook.com",
    "temporary_password": "rBZzeFxFf5",
    "login_url": "https://mou.malgary.com/auth/login",
    "must_change_password": true
  }
}
```

→ Show **credentials modal** (password once).

### Existing account (same email on another MOU)

```json
{
  "linked": true,
  "user_id": 61,
  "account_created": false,
  "existing_account": true,
  "email_sent": false,
  "credentials": null
}
```

→ **Do not** show credentials modal.  
→ Toast / banner: *"Existing Party A account linked to this MOU — they can log in with their current password."*

Same for Party B (`party_b` object).

---

## Frontend rule

```tsx
const partyA = response.party_a;
const partyB = response.party_b;

if (partyA?.account_created && partyA?.credentials) {
  openCredentialsModal({ side: 'A', ...partyA.credentials });
} else if (partyA?.existing_account) {
  toast.success('Existing Party A account linked — no new password.');
}

if (partyB?.account_created && partyB?.credentials) {
  openCredentialsModal({ side: 'B', ...partyB.credentials });
} else if (partyB?.existing_account) {
  toast.success('Existing Party B account linked — no new password.');
}
```

**Never** open the password modal when:

- `credentials` is `null` / missing, **or**
- `existing_account === true`

---

## Copy suggestions

| Case | Message |
|------|---------|
| New Party A | "Party A account created — share login credentials with Party A." |
| Existing Party A | "Existing Party A account linked. They can use their current login." |
| New Party B | "Party B account created — share login credentials with Party B." |
| Existing Party B | "Existing Party B account linked. They can use their current login." |

Fix modal footer that said “Party B must change…” on a **Party A** credentials dialog.

---

## Checklist

- [ ] Credentials modal only if `account_created && credentials`
- [ ] Soft success if `existing_account`
- [ ] Same for Party A and Party B
- [ ] After link, refetch `GET /api/proposals/:id` so Companies tab updates

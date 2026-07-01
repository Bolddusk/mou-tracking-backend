# Party A Auto-Account from Contact Edit — Frontend Integration

**Backend:** your API host (e.g. `http://localhost:5000`)  
**Auth:** `Authorization: Bearer <token>`  
**Endpoint:** `PATCH /api/proposals/:id/party-contacts` (same as Party B contact edit)  
**Roles:** `sector_lead`, `super_admin`

When Sector Lead or Super Admin saves **Party A** email + contact name on a proposal, the backend now **auto-creates or links** a `party_a` portal user and sets `party_a_id` on the proposal — same pattern as Party B.

Use this doc for **Party A** integration. For the full contact-edit form and Party B flow, see `PROPOSAL_PARTY_CONTACTS_FRONTEND.md`.

---

## 1. When provisioning runs

After a successful `PATCH /api/proposals/:id/party-contacts`:

| Condition | Backend action |
|-----------|----------------|
| Request includes `party_a_info` | Attempt Party A provisioning |
| `party_a_info.email` + `party_a_info.contact_name` both non-empty | Create/link user |
| Proposal status is `approved`, `submitted`, `resubmitted`, or `completed` | Allowed |
| Proposal status is `draft` | Contact edit blocked (`400`) |

**Historic imported MOUs** (Agri list) often have display names but empty email and `party_a_id` pointing to a placeholder admin user. After you fill email + contact name and save, the real Party A account is linked.

---

## 2. Request (Party A fields only)

```json
PATCH /api/proposals/42/party-contacts
Authorization: Bearer <token>
Content-Type: application/json

{
  "party_a_info": {
    "organization_name": "Green Corporate Initiative",
    "contact_name": "Shahid Nazir",
    "designation": "CEO",
    "email": "shahid@greencorp.pk",
    "phone": "03001234567",
    "country": "Pakistan",
    "city": "Lahore",
    "entity_type": "business",
    "department_ministry": ""
  }
}
```

**Required for auto-account:** `contact_name` + `email` (both in `party_a_info`).

Optional but recommended: `organization_name`, `phone` (copied to user profile on create).

---

## 3. Response `200` — `party_a` block

```json
{
  "message": "Party contact details updated successfully",
  "proposal": {
    "id": 42,
    "party_a_id": 15,
    "party_a_info": {
      "organization_name": "Green Corporate Initiative",
      "contact_name": "Shahid Nazir",
      "email": "shahid@greencorp.pk",
      "phone": "03001234567"
    },
    "party_a_name": "Shahid Nazir",
    "party_a_email": "shahid@greencorp.pk"
  },
  "capabilities": {
    "can_edit_party_contacts": true,
    "can_view_chat": true
  },
  "party_a": {
    "linked": true,
    "user_id": 15,
    "account_created": true,
    "existing_account": false,
    "email_sent": false,
    "credentials": {
      "email": "shahid@greencorp.pk",
      "temporary_password": "xK9mP2nQ4r",
      "login_url": "https://mou.malgary.com/auth/login",
      "must_change_password": true
    }
  },
  "party_b": null
}
```

### `party_a` field meanings

| Field | Meaning |
|-------|---------|
| `linked` | `party_a_id` updated on proposal |
| `user_id` | Linked `party_a` user id |
| `account_created` | New user was created |
| `existing_account` | Email already registered as `party_a` — password reset + re-linked |
| `email_sent` | Invite email delivered |
| `skipped` | Provisioning not run (see `reason`) |
| `credentials` | Temporary login (when email off or send failed) |

### Skip reasons (`party_a.skipped === true`)

| `reason` | Meaning | UI hint |
|----------|---------|---------|
| `missing_party_a_email` | Email empty after save | Ask user to enter email |
| `missing_party_a_contact_name` | Contact name empty | Ask user to enter contact name |
| `email_belongs_to_non_party_a_user` | Email used by sector_lead / party_b / admin | Show error: use a different email |

---

## 4. Credentials in API response

Same rules as Party B (`STEP5B_PARTY_B_API.md`):

- `party_a.credentials` returned when email is **not** configured, email **send failed**, or `RETURN_PARTY_B_CREDENTIALS_IN_RESPONSE=true`
- Set `RETURN_PARTY_B_CREDENTIALS_IN_RESPONSE=false` in production when SMTP works

Show a modal/toast so Sector Lead can share login with Party A when credentials are present.

---

## 5. Frontend handling

```tsx
async function savePartyAContacts(proposalId: number, partyA: PartyAForm) {
  const res = await api.patch(`/api/proposals/${proposalId}/party-contacts`, {
    party_a_info: {
      organization_name: partyA.organization,
      contact_name: partyA.contactName,
      designation: partyA.designation,
      email: partyA.email,
      phone: partyA.phone,
      country: partyA.country,
      city: partyA.city,
      entity_type: partyA.entityType,
      department_ministry: partyA.department,
    },
  });

  setProposal(res.data.proposal);

  const partyA = res.data.party_a;
  if (partyA?.credentials) {
    showCredentialsModal({
      title: 'Party A account created',
      ...partyA.credentials,
    });
  } else if (partyA?.linked && partyA.email_sent) {
    toast.success('Party A invite email sent');
  } else if (partyA?.skipped && partyA.reason === 'email_belongs_to_non_party_a_user') {
    toast.error('This email belongs to another role. Use a different Party A email.');
  } else if (partyA?.linked) {
    toast.success('Party A account linked');
  }
}
```

### UI checks after save

| Before | After save | UI change |
|--------|------------|-----------|
| `party_a_id` = placeholder / wrong user | `party_a.user_id` set | Show "Party A linked" |
| Party A could not log in | Credentials modal | Share login with contact |
| MOU ack blocked for Party A | Real `party_a_id` | Party A can acknowledge when required |
| Chat / activities | `party_a_id` matches user | Party A sees proposal in their dashboard |

**Do not** only check `party_a_info.email` — use `proposal.party_a_id` and `party_a.linked` from the PATCH response.

---

## 6. Combined save (Party A + Party B)

One PATCH can update both sides. Response includes both blocks:

```json
{
  "party_a": { "linked": true, "user_id": 15, "account_created": true },
  "party_b": { "linked": true, "user_id": 16, "account_created": true }
}
```

Handle each independently (two credential modals if both return credentials).

---

## 7. Errors (contact edit)

| Status | Error |
|--------|-------|
| `400` | `Invalid Party A email address` |
| `400` | `Party contact details cannot be edited on draft proposals` |
| `403` | `Access denied — wrong sector` |
| `404` | `Proposal not found` |

Provisioning failures for wrong-role email do **not** fail the PATCH — contact fields are saved; check `party_a.skipped` + `party_a.reason`.

---

## 8. Test checklist

1. Open historic Agri MOU (empty Party A email) as Sector Lead
2. Fill `contact_name` + `email` → Save
3. Response: `party_a.linked === true`, `proposal.party_a_id` updated (not superadmin id)
4. Login as new Party A email → proposal visible in their list
5. Save email that belongs to `sectorlead@test.com` → `party_a.reason === 'email_belongs_to_non_party_a_user'`
6. Save existing `party_a` email → `existing_account: true`, new temp password (no duplicate user)

---

## Related docs

- `PROPOSAL_PARTY_CONTACTS_FRONTEND.md` — full contact edit form (Party A + Party B)
- `STEP5B_PARTY_B_API.md` — Party B credentials & email env
- `HISTORIC_MOU_FILTERING_FRONTEND.md` — historic MOU ack/chat rules

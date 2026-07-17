# Proposal Party A / Party B Contact Edit — Frontend Integration

**Backend:** your API host (e.g. `http://localhost:5000`)  
**Auth:** `Authorization: Bearer <token>`  
**Roles:** `sector_lead`, `super_admin`, `admin`, linked `party_a` / `party_b` (own side only)

Staff edit both sides; each linked party edits **only their own** side.

**Companies tab (parties):** see `COMPANIES_TAB_PARTY_A_FRONTEND.md`.

---

## 1. Who can edit

| Role | Party A card | Party B card | Rule |
|------|--------------|--------------|------|
| `super_admin` / `admin` | ✅ | ✅ | Any proposal except `draft` |
| `sector_lead` | ✅ | ✅ | Own sector only |
| `party_a` (linked) | ✅ | ❌ | Own MOU, non-draft |
| `party_b` (linked) | ❌ | ✅ | Own MOU, non-draft |

Check capability from proposal detail:

```
GET /api/proposals/:id
```

Response includes:

```json
{
  "capabilities": {
    "can_view_companies": true,
    "can_edit_party_a_contacts": true,
    "can_edit_party_b_contacts": true,
    "can_edit_party_contacts": true
  }
}
```

| Flag | UI |
|------|-----|
| `can_edit_party_a_contacts` | Edit on Pakistani card |
| `can_edit_party_b_contacts` | Edit on Chinese card |
| `can_edit_party_contacts` | Legacy (staff both); Party A is `false` — use split flags |

---

## 2. Update party contacts

```
PATCH /api/proposals/:id/party-contacts
Authorization: Bearer <token>
Content-Type: application/json
```

### Request body

Send only fields you want to update. All fields optional.

**Recommended (symmetric Party A + Party B):**

```json
{
  "party_a_info": {
    "entity_type": "business",
    "organization_name": "Green Corporate Initiative",
    "department_ministry": "",
    "contact_name": "Shahid Nazir",
    "designation": "CEO",
    "email": "shahid@greencorp.pk",
    "phone": "03001234567",
    "country": "Pakistan",
    "city": "Lahore"
  },
  "party_b_info": {
    "entity_type": "business",
    "organization_name": "Famsun Group Co., Ltd.",
    "department_ministry": "",
    "contact_name": "Chen Zhenjun",
    "designation": "Director",
    "email": "chen.zhenjun@famsun.com",
    "phone": "+86-138-0000-1234",
    "country": "China",
    "city": "Changzhou"
  }
}
```

**Legacy (still supported):** flat Party B fields

```json
{
  "party_a_info": { "...": "..." },
  "party_b_name": "Chen Zhenjun",
  "party_b_organization": "Famsun Group Co., Ltd.",
  "party_b_email": "chen.zhenjun@famsun.com",
  "party_b_phone": "+86-138-0000-1234",
  "party_b_country": "China"
}
```

### Party A fields (`party_a_info`)

| Field | Label in UI |
|-------|-------------|
| `entity_type` | Entity type (`business` / `government`) |
| `organization_name` | Organization |
| `department_ministry` | Department / Ministry |
| `contact_name` | Contact name |
| `designation` | Designation |
| `email` | Email |
| `phone` | Phone |
| `country` | Country |
| `city` | City |

Also updates `company_name` on proposal when `organization_name` is sent.

### Party B fields (`party_b_info`) — same shape as Party A

| Field | Label in UI |
|-------|-------------|
| `entity_type` | Entity type (`business` / `government`) |
| `organization_name` | Organization |
| `department_ministry` | Department / Ministry |
| `contact_name` | Contact name |
| `designation` | Designation |
| `email` | Email (stored lowercase — login email) |
| `phone` | Phone |
| `country` | Country |
| `city` | City |

Also updates `venture_name` when `organization_name` is sent.

Backend keeps legacy flat columns (`party_b_name`, `party_b_email`, …) in sync for reports and older clients.

### Legacy Party B fields (top-level, still accepted)

| Field | Maps to `party_b_info` |
|-------|------------------------|
| `party_b_name` | `contact_name` |
| `party_b_organization` | `organization_name` |
| `party_b_email` | `email` |
| `party_b_phone` | `phone` |
| `party_b_country` | `country` |
| `party_b_entity_type` | `entity_type` |

---

## 3. Response `200`

```json
{
  "message": "Party contact details updated successfully",
  "proposal": {
    "id": 18,
    "party_a_info": {
      "contact_name": "Shahid Nazir",
      "email": "shahid@greencorp.pk",
      "organization_name": "Green Corporate Initiative"
    },
    "party_b_info": {
      "contact_name": "Chen Zhenjun",
      "email": "chen.zhenjun@famsun.com",
      "organization_name": "Famsun Group Co., Ltd.",
      "designation": "Director",
      "city": "Changzhou"
    },
    "party_b_name": "Chen Zhenjun",
    "party_b_email": "chen.zhenjun@famsun.com",
    "party_b_user_id": 12
  },
  "capabilities": {
    "can_edit_party_contacts": true,
    "can_view_chat": true
  },
  "party_b": {
    "linked": true,
    "user_id": 12,
    "account_created": true,
    "email_sent": false,
    "credentials": {
      "email": "chen.zhenjun@famsun.com",
      "temporary_password": "xK9mP2nQ4r",
      "login_url": "https://mou.malgary.com/auth/login",
      "must_change_password": true
    }
  }
}
```

### Auto Party B account linking

When **`party_b_info.email`** (or legacy `party_b_email`) is saved and proposal status is `approved` (or submitted/resubmitted/completed):

- Backend auto-creates or links a **`party_b`** user account (same as approve flow)
- Response may include `party_b.credentials` if email is not configured
- After link, **Chat** tab works for Party B when they log in

If email is invalid → `400 Invalid Party B email address`

### Auto Party A account linking

When **`party_a_info.email`** + **`party_a_info.contact_name`** are saved (same statuses):

- Backend auto-creates or links a **`party_a`** user and updates `party_a_id`
- Response includes `party_a` block (same shape as `party_b`)
- Historic imported MOUs: replaces placeholder `party_a_id` with real user

**Full Party A integration guide:** `PROPOSAL_PARTY_A_CONTACTS_FRONTEND.md`

---

## 4. Errors

| Status | Error |
|--------|-------|
| `400` | `No party contact fields provided` |
| `400` | `Invalid Party A email address` |
| `400` | `Invalid Party B email address` |
| `400` | `Party contact details cannot be edited on draft proposals` |
| `403` | `Access denied — wrong sector` (sector lead) |
| `403` | `Access denied` |
| `404` | `Proposal not found` |

---

## 5. Suggested UI (Proposal Detail → Details tab)

### Read mode (default)

Party A and Party B cards show current values (`---` if empty).

### Edit mode

When `capabilities.can_edit_party_contacts`:

1. **Edit contacts** button on Details tab (or per-card pencil icon)
2. Opens inline form or modal with Party A + Party B fields
3. **Save** → `PATCH /api/proposals/:id/party-contacts`
4. **Cancel** → discard local changes

```
[ Edit contacts ]   (visible for Sector Lead + Super Admin)

Party A                          Party B
Organization  [________]         Organization  [________]
Contact       [________]         Name          [________]
Email         [________]         Email         [________]
Phone         [________]         Phone         [________]
Country       [________]         Country       [________]

                    [ Cancel ]  [ Save changes ]
```

After save:
- Refresh proposal state from response `proposal`
- If `party_b.credentials` present, show toast: *"Party B account created — share login credentials"*
- Hide chat warning *"Party B is not linked"* when `party_b_user_id` is set

---

## 6. Frontend example

```tsx
async function savePartyContacts(proposalId: number, form: PartyContactForm) {
  const res = await api.patch(`/api/proposals/${proposalId}/party-contacts`, {
    party_a_info: {
      organization_name: form.partyA.organization,
      contact_name: form.partyA.contactName,
      designation: form.partyA.designation,
      email: form.partyA.email,
      phone: form.partyA.phone,
      country: form.partyA.country,
      city: form.partyA.city,
      entity_type: form.partyA.entityType,
      department_ministry: form.partyA.department,
    },
    party_b_info: {
      organization_name: form.partyB.organization,
      contact_name: form.partyB.contactName,
      designation: form.partyB.designation,
      email: form.partyB.email,
      phone: form.partyB.phone,
      country: form.partyB.country,
      city: form.partyB.city,
      entity_type: form.partyB.entityType,
      department_ministry: form.partyB.department,
    },
  });

  setProposal(res.data.proposal);
  setCapabilities(res.data.capabilities);

  if (res.data.party_b?.credentials) {
    showCredentialsModal(res.data.party_b.credentials);
  }

  if (res.data.party_a?.credentials) {
    showCredentialsModal({ title: 'Party A', ...res.data.party_a.credentials });
  }
}
```

---

## 7. Historic imported MOUs

Imported Agri MOU records often have empty email/phone (`---` in UI). Sector Lead / Super Admin can fill these in and save — no re-import needed.

---

## 8. Test checklist

1. Login as `sectorlead@test.com` → open proposal in own sector
2. `capabilities.can_edit_party_contacts` should be `true`
3. Add Party B email → Save → `party_b_user_id` populated
4. Chat tab — Party B linked message should disappear
5. Login as `superadmin@test.com` → any non-draft proposal editable
6. Wrong sector sector lead → `403`

---

## Related docs

- `PROPOSAL_PARTY_A_CONTACTS_FRONTEND.md` — Party A auto-account from contact save
- `STEP5B_PARTY_B_API.md` — Party B auto-account on approve
- `STEP5_USER_MANAGEMENT_API.md` — manual user create (alternative)
- `CONFERENCE_FILTER_PAGINATION_FRONTEND.md` — list filters

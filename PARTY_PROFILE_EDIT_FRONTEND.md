# Party A & B Profile Edit — Frontend (Staff Roles)

Staff roles can now **edit** Party A and Party B profiles (not just read-only).

---

## Who can edit

| Role | Party A | Party B | Scope |
|------|---------|---------|-------|
| `party_a` | ✅ own | ❌ | `PATCH /api/profile` |
| `party_b`, `investor` | ❌ | ✅ own | `PATCH /api/profile/party-b` |
| `super_admin`, `admin` | ✅ | ✅ | any user |
| `sector_lead` | ✅ | ✅ | users with proposals in assigned sectors |
| `focal_point`, `regional_focal_point` | ✅ | ✅ | users linked to their matchmaking engagements |

**Counterparty on proposal** (Party A viewing Party B, etc.) stays **read-only**.

---

## Response flags

`GET /api/profile/:userId` and `GET /api/profile/party-b/:userId` now return:

```json
{
  "read_only": false,
  "can_edit": true,
  "profile": { ... },
  "documents": [ ... ],
  "completion": { ... }
}
```

**Frontend rule:** hide "Read Only" badge and show Save/Upload when `can_edit === true` (or `read_only === false`).

Proposal detail snapshots (`party_a_profile.data`, `party_b_profile.data`) use the same flags.

---

## Staff edit APIs (by target user id)

### Party A

| Action | Method | Endpoint |
|--------|--------|----------|
| View | `GET` | `/api/profile/:userId` |
| Update fields | `PATCH` | `/api/profile/party-a/:userId` |
| Upload document | `POST` | `/api/profile/party-a/:userId/documents` (multipart, field `document`) |
| Delete other doc | `DELETE` | `/api/profile/party-a/:userId/documents/:docId` |

### Party B

| Action | Method | Endpoint |
|--------|--------|----------|
| View | `GET` | `/api/profile/party-b/:userId` |
| Update fields | `PATCH` | `/api/profile/party-b/:userId` |
| Upload document | `POST` | `/api/profile/party-b/:userId/documents` |
| Delete other doc | `DELETE` | `/api/profile/party-b/:userId/documents/:docId` |

**PATCH body** — same fields as own-profile edit (see `PARTY_PROFILES_FRONTEND.md`).

**Upload** — same `doc_type` rules:
- Party A: `fbr_certificate`, `secp_certificate`, `other`
- Party B: `business_license`, `registration_certificate`, `other`

---

## Frontend changes (Super Admin / SL profile pages)

### Before
```tsx
// Always read-only for staff viewing /party-a-profiles/:id
{data.read_only && <Badge>Read Only</Badge>}
```

### After
```tsx
const { can_edit, read_only } = data;

{read_only && <Badge>Read Only</Badge>}

{can_edit ? (
  <>
    <ProfileForm defaultValues={data.profile} onSave={handleSave} />
    <DocumentUpload onUpload={handleUpload} />
  </>
) : (
  <ProfileReadOnlyView profile={data.profile} />
)}
```

### Save (staff editing user `14`)

```ts
// Party A
await api.patch(`/api/profile/party-a/${userId}`, {
  company_name: 'Verdora Ventures Pvt Ltd',
  company_description: '...',
  address: '...',
  phone: '...',
  sectors: ['Agri-chemicals & Inputs'],
  tax_id: '...',
  secp_number: '...',
});

// Party B
await api.patch(`/api/profile/party-b/${userId}`, {
  company_name: 'Beijing GXP Investment Consulting Co. Ltd',
  country: 'China',
  address: '...',
  phone: '...',
});
```

### Upload (staff)

```ts
const form = new FormData();
form.append('document', file);
form.append('doc_type', 'fbr_certificate'); // or business_license for Party B

await api.post(`/api/profile/party-a/${userId}/documents`, form);
// or `/api/profile/party-b/${userId}/documents`
```

---

## Routes mapping (your screenshots)

| Page | Load | Save |
|------|------|------|
| `/dashboard/super-admin/party-a-profiles/:id` | `GET /api/profile/:id` | `PATCH /api/profile/party-a/:id` |
| `/dashboard/super-admin/party-b-profiles/:id` | `GET /api/profile/party-b/:id` | `PATCH /api/profile/party-b/:id` |
| Sector lead same pattern | same APIs | same APIs |

Investor / Party B **own** profile — unchanged: `GET/PATCH /api/profile/party-b`.

---

## Checklist

- [ ] Remove hardcoded "Read Only" for super_admin / sector_lead
- [ ] Use `can_edit` from API response
- [ ] Wire staff PATCH + document upload to `/:userId` endpoints
- [ ] Keep counterparty proposal MOU cards read-only when `can_edit === false`

See also: `PARTY_PROFILES_FRONTEND.md` for field lists and completion rules.

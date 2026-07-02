# Party A & Party B Profiles — Frontend Integration (Unified)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Party A and Party B both have **profile completion** flows (company info + mandatory documents + completion %).

Proposal detail (`GET /api/proposals/:id`) now embeds both profiles for the **MOU tab** and **Details** party cards.

---

## Setup (once)

```bash
cd investment-portal-backend
npm run db:migrate:party-a-profile
npm run db:migrate:party-b-profile
npm run dev
```

---

## 1. Proposal detail — embedded profiles (MOU tab)

```
GET /api/proposals/:id
```

New fields on response:

```json
{
  "id": 113,
  "party_a_id": 4,
  "party_b_user_id": null,
  "party_a_info": { "organization_name": "...", "contact_name": "...", "email": "" },
  "party_b_name": "Zhu Zhichao",
  "party_b_email": "",
  "party_a_profile": {
    "linked": true,
    "data": {
      "read_only": true,
      "user": { "id": 4, "full_name": "...", "email": "..." },
      "profile": { "company_name": "...", "profile_complete": true },
      "documents": [ ... ],
      "completion": { "completion_pct": 100, "profile_complete": true, "missing_fields": [] }
    }
  },
  "party_b_profile": {
    "linked": false,
    "data": null,
    "reason": "no_party_b_user"
  }
}
```

### Snapshot shape

| Field | Meaning |
|-------|---------|
| `linked` | `false` = user account not linked to proposal |
| `data` | Full profile payload when loaded; `null` if not available |
| `reason` | e.g. `no_party_b_user`, `Party B not linked`, `Party A profile not found` |
| `data.read_only` | `true` for sector lead / counterparty view |

### Frontend MOU tab logic

```tsx
// Party A card
const partyA = proposal.party_a_profile?.data;
if (partyA) {
  // Show profile.profile, completion.completion_pct, documents
} else {
  // Fallback: proposal.party_a_info + banner from party_a_profile.reason
}

// Party B card
const partyB = proposal.party_b_profile?.data;
if (partyB) {
  // Show full Party B profile
} else if (!proposal.party_b_profile?.linked) {
  // Show proposal.party_b_* fields + "Party B not linked — Edit contacts"
} else {
  // Linked but profile empty — prompt to complete profile
}
```

**Historic MOUs:** `party_a_id` may be a placeholder until contacts are saved → `party_a_profile.data` may be `null`. Use `party_a_info` from proposal until linked.

---

## 2. Party A profile APIs

**Roles:** edit = `party_a` | view = `party_a`, `sector_lead`, `super_admin`

| Action | Method | Endpoint |
|--------|--------|----------|
| My profile | `GET` | `/api/profile` |
| View by user id | `GET` | `/api/profile/:userId` |
| List (SL/SA) | `GET` | `/api/profile/party-a` |
| Update | `PATCH` | `/api/profile` |
| Upload doc | `POST` | `/api/profile/documents` (multipart, field `document`) |
| Delete other doc | `DELETE` | `/api/profile/documents/:id` |
| Sector options | `GET` | `/api/profile/sectors` |

### Mandatory documents (Party A — Pakistan)

| Document | `doc_type` |
|----------|------------|
| FBR Taxpayer Registration Certificate | `fbr_certificate` |
| SECP Certificate of Incorporation | `secp_certificate` |
| Other | `other` + `title` |

### Completion checks (9 items → 100%)

Company name, description, sectors, address, phone, FBR Tax ID, FBR certificate file, SECP number, SECP certificate file.

**Sidebar:** Party A → **My Profile** → `/dashboard/party-a/profile`

---

## 3. Party B profile APIs (NEW — mirror Party A)

**Roles:** edit = `party_b`, `investor` | view = `party_b`, `investor`, `sector_lead`, `super_admin`

| Action | Method | Endpoint |
|--------|--------|----------|
| My profile OR list | `GET` | `/api/profile/party-b` |
| View by user id | `GET` | `/api/profile/party-b/:userId` |
| Update | `PATCH` | `/api/profile/party-b` |
| Upload doc | `POST` | `/api/profile/party-b/documents` (multipart, field `document`) |
| Delete other doc | `DELETE` | `/api/profile/party-b/documents/:id` |
| Sector options | `GET` | `/api/profile/sectors` (shared) |

### `GET /api/profile/party-b` behavior

| Role | Response |
|------|----------|
| `party_b`, `investor` | Own full profile (same shape as Party A) |
| `sector_lead`, `super_admin` | List `{ scope, profiles: [...] }` |

### Mandatory documents (Party B — international)

| Document | `doc_type` |
|----------|------------|
| Business License | `business_license` |
| Company Registration Certificate | `registration_certificate` |
| Other | `other` + `title` |

### Profile fields (Party B)

| Field | Label |
|-------|-------|
| `company_name` | Company Name |
| `registration_number` | Business Registration / USCC |
| `country` | Country (default `China`) |
| `address` | Address |
| `phone` | Phone |
| `website` | Website |
| `tax_id` | Tax Registration Number |
| `company_reg_number` | Company Registration Number |
| `company_description` | Description |
| `sectors` | Interest sectors (array) |
| `hs_codes` | HS Codes |
| `business_license_issue_date` | Business license issue date |
| `business_license_authority` | Issuing authority |
| `company_reg_date` | Company registration date |

### Completion checks (10 items → 100%)

Company name, description, sectors, address, phone, country, tax ID, business license file, company reg number, registration certificate file.

**Sidebar:** Party B → **My Profile** → `/dashboard/party-b/profile`

---

## 4. Response shape (both parties — identical structure)

```json
{
  "read_only": false,
  "user": {
    "id": 8,
    "full_name": "Li Wei",
    "email": "liwei@company.cn",
    "organization": "SinoAgri Corp",
    "phone": "+86-138-0000-5678",
    "country": "China"
  },
  "profile": {
    "user_id": 8,
    "company_name": "SinoAgri Corp",
    "profile_complete": false,
    "sectors": ["Agri-chemicals & Inputs"]
  },
  "documents": [
    {
      "id": 1,
      "doc_type": "business_license",
      "title": "Business License",
      "file_url": "http://localhost:5000/uploads/profiles/....pdf",
      "original_filename": "license.pdf"
    }
  ],
  "completion": {
    "completion_pct": 60,
    "profile_complete": false,
    "missing_fields": ["Business License", "Company Registration Certificate"],
    "mandatory_documents": {
      "business_license": null,
      "registration_certificate": null
    },
    "other_documents": []
  },
  "available_sectors": ["Agri-chemicals & Inputs", "..."]
}
```

Party A uses `fbr_certificate` / `secp_certificate` in `mandatory_documents` instead.

---

## 5. Upload document (both parties)

```
POST /api/profile/documents          (Party A)
POST /api/profile/party-b/documents  (Party B)
Content-Type: multipart/form-data
```

| Field | Required |
|-------|----------|
| `document` | File (PDF, DOC, DOCX, JPG, PNG, WEBP — max 10 MB) |
| `doc_type` | See tables above |
| `title` | Required when `doc_type=other` |
| `description` | Optional |

---

## 6. Access rules (view by user id)

### Party A — `GET /api/profile/:userId`

Sector lead: only if Party A has non-draft proposal in SL sector.

### Party B — `GET /api/profile/party-b/:userId`

Sector lead: only if Party B is linked (`party_b_user_id`) to a non-draft proposal in SL sector.

### On proposal detail (embedded)

Anyone with proposal access can read counterparty profile (read-only): Party A ↔ Party B, sector lead, super admin.

---

## 7. UI pages to build

| Page | Route | API |
|------|-------|-----|
| Party A My Profile | `/dashboard/party-a/profile` | `GET/PATCH /api/profile` |
| Party B My Profile | `/dashboard/party-b/profile` | `GET/PATCH /api/profile/party-b` |
| SL Party A list | `/dashboard/sector-lead/party-a-profiles` | `GET /api/profile/party-a` |
| SL Party B list | `/dashboard/sector-lead/party-b-profiles` | `GET /api/profile/party-b` |
| Proposal MOU tab | `/proposals/:id` (MOU tab) | `GET /api/proposals/:id` → use embedded profiles |

### MOU tab layout

```
┌─────────────────────────────────────────────────────────┐
│ MOU PDF viewer (mou_file_url)                           │
├──────────────────────┬──────────────────────────────────┤
│ Party A              │ Party B                          │
│ ─ proposal contacts  │ ─ proposal contacts              │
│ ─ profile (if data)  │ ─ profile (if data)              │
│   completion %       │   completion %                   │
│   company + tax docs │   license + reg docs             │
│ [View Profile] link  │ [View Profile] link              │
└──────────────────────┴──────────────────────────────────┘
```

Show completion badge: `completion.profile_complete` ? green ✓ : amber % + missing fields.

---

## 8. Frontend prompt (copy into Cursor)

```
Build Party A + Party B profile completion and MOU tab party cards.

Stack: React (Vite) + Tailwind, API http://localhost:5000
Follow PARTY_PROFILES_FRONTEND.md

PARTY A (existing + MOU integration):
- My Profile page at /dashboard/party-a/profile
- APIs: GET/PATCH /api/profile, POST /api/profile/documents
- Mandatory: fbr_certificate, secp_certificate
- Completion bar from completion.completion_pct

PARTY B (new — mirror Party A):
- My Profile page at /dashboard/party-b/profile
- APIs: GET/PATCH /api/profile/party-b, POST /api/profile/party-b/documents
- Mandatory: business_license, registration_certificate
- Roles: party_b, investor can edit own profile

PROPOSAL MOU TAB (/proposals/:id):
- GET /api/proposals/:id includes party_a_profile and party_b_profile snapshots
- If snapshot.data exists: show full profile + documents + completion badge
- Else: fallback to party_a_info / party_b_* proposal fields + reason banner
- Historic MOU: party_b_profile.linked=false until Edit contacts + approve links Party B

Read-only when snapshot.data.read_only === true (hide Save/upload).

Sector Lead lists:
- GET /api/profile/party-a and GET /api/profile/party-b (list when SL role)
- Detail: GET /api/profile/:userId (Party A) or GET /api/profile/party-b/:userId

Theme: green #006435. View document opens file_url in new tab.
```

---

## 9. Test checklist

1. `npm run db:migrate:party-b-profile`
2. Login as `partyb@test.com` → `GET /api/profile/party-b` → empty profile
3. `PATCH /api/profile/party-b` + upload `business_license` + `registration_certificate`
4. `completion.profile_complete === true`
5. Login as sector lead → open approved proposal → `GET /api/proposals/:id` has `party_b_profile.data`
6. MOU tab shows both party cards with completion %

---

## Related docs

- `STEP16_PARTY_A_PROFILE_API.md` — Party A edit details
- `STEP16B_PARTY_A_PROFILE_VIEW_API.md` — Party A read-only view
- `STEP5B_PARTY_B_API.md` — Party B account linking on approve
- `PROPOSAL_PARTY_CONTACTS_FRONTEND.md` — Edit contacts on historic MOUs

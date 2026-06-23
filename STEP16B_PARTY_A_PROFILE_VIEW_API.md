# Step 16B — View Party A Profile (Sector Lead + Super Admin)

**Backend:** `http://localhost:5000`  
**Frontend:** `http://localhost:5173`  
**Auth:** `Authorization: Bearer <token>`

Read-only profile view for **Sector Lead** and **Super Admin**. Party A continues to use **STEP16** for edit/upload.

---

## Who can do what

| Role | List Party A profiles | View profile by user id | Edit / upload |
|------|----------------------|-------------------------|---------------|
| `party_a` | ❌ | ✅ own id only (`GET /api/profile` or `GET /api/profile/:ownId`) | ✅ |
| `sector_lead` | ✅ own sector | ✅ if Party A has submitted proposal in SL sector | ❌ read-only |
| `super_admin` | ✅ all | ✅ any Party A | ❌ read-only |

---

## Access rules (Sector Lead)

Sector Lead can view a Party A profile **only if** that Party A has at least one **non-draft** proposal in the sector lead's sector — in either:

- Legacy MOUS: `proposals` table  
- Matchmaking PK: `mm_pakistan_proposals` table  

Otherwise: `403` — *This Party A has no submitted proposals in your sector*

Super Admin has **no sector filter** — can view any Party A.

---

## APIs

### 1. List Party A profiles

```
GET /api/profile/party-a
Authorization: Bearer <token>
```

**Roles:** `sector_lead`, `super_admin`

**Super Admin response `200`:**

```json
{
  "scope": "all",
  "profiles": [
    {
      "id": 2,
      "full_name": "Party A — Ali Khan",
      "email": "partya@test.com",
      "organization": "Khan Industries Pvt Ltd",
      "phone": "03001234567",
      "company_name": "Khan Industries Pvt Ltd",
      "profile_complete": true,
      "profile_updated_at": "2026-06-04T12:00:00.000Z"
    }
  ]
}
```

**Sector Lead response `200`:**

```json
{
  "scope": "sector",
  "sector": "Agri-chemicals & Inputs",
  "profiles": [ ... ]
}
```

Only Party A users with submitted proposals in that sector appear.

---

### 2. View profile by user id

```
GET /api/profile/:userId
Authorization: Bearer <token>
```

**Roles:** `party_a` (own id), `sector_lead`, `super_admin`

**Example:**

```
GET /api/profile/2
```

**Response `200`:**

```json
{
  "read_only": true,
  "user": {
    "id": 2,
    "full_name": "Party A — Ali Khan",
    "email": "partya@test.com",
    "organization": "Khan Industries Pvt Ltd",
    "phone": "03001234567",
    "created_at": "2026-03-01T08:00:00.000Z"
  },
  "profile": {
    "user_id": 2,
    "company_name": "Khan Industries Pvt Ltd",
    "registration_number": "123456",
    "address": "Lahore, Pakistan",
    "phone": "03001234567",
    "website": "https://example.com",
    "tax_id": "1234567-8",
    "secp_number": "0123456",
    "psw_id": "PSW-123",
    "company_description": "Agriculture with AI",
    "sectors": ["Agri-chemicals & Inputs"],
    "hs_codes": "1006.30",
    "fbr_certificate_issue_date": "2020-01-15",
    "fbr_tax_office": "Lahore",
    "secp_incorporation_date": "2018-06-01",
    "profile_complete": true,
    "created_at": "2026-06-04T10:00:00.000Z",
    "updated_at": "2026-06-04T12:00:00.000Z"
  },
  "documents": [
    {
      "id": 1,
      "doc_type": "fbr_certificate",
      "title": "FBR Taxpayer Registration Certificate",
      "description": null,
      "file_url": "http://localhost:5000/uploads/profiles/1717500000-123.pdf",
      "original_filename": "fbr-cert.pdf",
      "uploaded_at": "2026-06-04T11:05:00.000Z"
    },
    {
      "id": 2,
      "doc_type": "secp_certificate",
      "title": "SECP Certificate of Incorporation",
      "file_url": "http://localhost:5000/uploads/profiles/1717500001-456.pdf",
      "original_filename": "secp-cert.pdf",
      "uploaded_at": "2026-06-04T11:10:00.000Z"
    },
    {
      "id": 3,
      "doc_type": "other",
      "title": "Bank Statement",
      "description": "Q1 2026",
      "file_url": "http://localhost:5000/uploads/profiles/1717500002-789.pdf",
      "original_filename": "bank.pdf",
      "uploaded_at": "2026-06-04T11:15:00.000Z"
    }
  ],
  "completion": {
    "completion_pct": 100,
    "profile_complete": true,
    "missing_fields": [],
    "mandatory_documents": {
      "fbr_certificate": { "id": 1, "file_url": "..." },
      "secp_certificate": { "id": 2, "file_url": "..." }
    },
    "other_documents": [ { "id": 3, "title": "Bank Statement", "file_url": "..." } ]
  },
  "available_sectors": ["Agri-chemicals & Inputs", "..."]
}
```

| Field | Meaning |
|-------|---------|
| `read_only` | `true` for SL/SA (hide Save + upload buttons) |
| `read_only` | `false` when Party A views own profile |
| `user` | Account summary |
| `documents` | All uploaded files |
| `completion.mandatory_documents` | Quick FBR/SECP status |

---

## Errors

| Status | When |
|--------|------|
| `400` | Invalid user id / SL has no sector |
| `403` | Wrong role / Party A viewing someone else / SL no proposal in sector |
| `404` | User not found or not `party_a` |

---

## Where to show in UI

### Super Admin
- Sidebar: **Admin → Party A Profiles** (or under Direct Opportunities)
- List page: `GET /api/profile/party-a`
- Row click → `/dashboard/super-admin/party-a/:userId/profile`
- Detail: `GET /api/profile/:userId` — read-only

### Sector Lead
- From proposal review row → **View Party A Profile** button  
  (`party_a_id` from `GET /api/proposals/sector-lead` or matchmaking PK list)
- Or list: `GET /api/profile/party-a` (sector-filtered)
- Detail: `GET /api/profile/:userId` — read-only

### Party A
- **My Profile** (edit): `GET /api/profile` — same as `GET /api/profile/:ownId` with `read_only: false`

---

## Read-only detail page layout

```
┌─────────────────────────────────────────┐
│ Party A Profile (Read Only)             │
│ Ali Khan · Khan Industries · 100% ✓     │
├─────────────────────────────────────────┤
│ Company Information (display only)      │
│ - Company Name, Address, Phone, ...     │
│ - Sectors (tags)                        │
│ - Tax ID, SECP Number, PSW ID           │
├─────────────────────────────────────────┤
│ Mandatory Documents                     │
│ [FBR Certificate]  View PDF             │
│ [SECP Certificate] View PDF             │
├─────────────────────────────────────────┤
│ Other Documents                         │
│ - Bank Statement — View / Download      │
└─────────────────────────────────────────┘
```

**Hide when `read_only === true`:**
- Save Changes button  
- File upload inputs  
- Delete document buttons  
- Sector checkboxes (show as read-only tags)

**Show:**
- View / Download links on every `file_url`  
- Completion badge (`completion.completion_pct`)  
- Missing mandatory docs warning if incomplete  

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Party A | `partya@test.com` | `password123` |
| Sector Lead | `sectorlead@test.com` | `password123` |
| Super Admin | `superadmin@test.com` | `password123` |

### Postman quick test

1. Login as `superadmin@test.com`  
2. `GET /api/profile/party-a` → list  
3. `GET /api/profile/2` → full read-only profile  

4. Login as `sectorlead@test.com`  
5. `GET /api/profile/party-a` → only Party A in Agri-chemicals sector  
6. `GET /api/profile/2` → works if Party A has submitted proposal in that sector  

---

## Frontend prompt (copy into Cursor)

```
Build read-only Party A Profile view for Sector Lead and Super Admin.

Stack: React (Vite) + Tailwind, API http://localhost:5000
Follow STEP16B_PARTY_A_PROFILE_VIEW_API.md

Routes:
- Super Admin list: /dashboard/super-admin/party-a-profiles
- Super Admin detail: /dashboard/super-admin/party-a-profiles/:userId
- Sector Lead list: /dashboard/sector-lead/party-a-profiles
- Sector Lead detail: /dashboard/sector-lead/party-a-profiles/:userId

List page:
- GET /api/profile/party-a
- Table: full_name, email, company_name, profile_complete badge, profile_updated_at
- Row click opens detail page

Detail page:
- GET /api/profile/:userId
- If response.read_only === true: no edit controls
- Show user.full_name, user.email at top
- Display all profile fields read-only
- Sectors as green tags (not checkboxes)
- Mandatory docs section: FBR + SECP with View Document button (open file_url in new tab)
- Other documents list with View link
- Completion bar from completion.completion_pct
- Back button to list

Sector Lead integration:
- On proposal review table (legacy + matchmaking PK), add "View Profile" link using party_a_id → detail route

Super Admin sidebar: add "Party A Profiles" under Admin section
Sector Lead sidebar: add "Party A Profiles" or link from proposal rows only

Use green #006435 theme. Handle 403 with friendly message.
```

---

## Related docs

- **STEP16_PARTY_A_PROFILE_API.md** — Party A edit + upload (My Profile)
- Edit APIs remain `PATCH /api/profile` and `POST /api/profile/documents` — **Party A only**

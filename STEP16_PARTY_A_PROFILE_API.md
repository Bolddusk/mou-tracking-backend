# Step 16 — Party A Profile + Mandatory Documents (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Frontend:** `http://localhost:5173`  
**Auth:** `Authorization: Bearer <token>`  
**Role:** `party_a` only (edit). **View by id:** `STEP16B_PARTY_A_PROFILE_VIEW_API.md` (Sector Lead + Super Admin read-only).

Paste this document into your frontend Cursor chat to build the **My Profile** page for Party A.

---

## Setup (once)

```bash
cd investment-portal-backend
npm run db:migrate:party-a-profile
npm run dev
```

---

## What to build

**Sidebar:** add **My Profile** under Party A nav (e.g. `/dashboard/party-a/profile`).

**Page sections:**
1. Company information form (text fields)
2. Mandatory document uploads (FBR + SECP)
3. Other documents (optional, multiple)
4. Profile completion bar (`completion.completion_pct` + missing fields list)

Reference UI: Pak-China Agriculture Investment profile page (company info + sectors checkboxes + completion box).

---

## Mandatory documents

| Document | `doc_type` | Info fields on profile | File required |
|----------|------------|------------------------|---------------|
| FBR Taxpayer Registration Certificate | `fbr_certificate` | `tax_id` (NTN), optional `fbr_certificate_issue_date`, `fbr_tax_office` | Yes |
| SECP Certificate of Incorporation | `secp_certificate` | `secp_number`, optional `secp_incorporation_date` | Yes |

**Other documents:** `doc_type: other` + `title` (required) + optional `description` + file.

Allowed file types: PDF, DOC, DOCX, JPG, PNG, WEBP — max **10 MB**.

---

## Profile completion (100%)

Backend calculates `completion.completion_pct` from 9 checks:

| Check | Field / document |
|-------|------------------|
| Company Name | `profile.company_name` |
| Company Description | `profile.company_description` |
| At least one Sector | `profile.sectors[]` |
| Address | `profile.address` |
| Phone Number | `profile.phone` |
| FBR Tax ID (NTN) | `profile.tax_id` |
| FBR Certificate file | `completion.mandatory_documents.fbr_certificate` |
| SECP Incorporation Number | `profile.secp_number` |
| SECP Certificate file | `completion.mandatory_documents.secp_certificate` |

`profile.profile_complete === true` when all 9 are met.

---

## API summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/profile/sectors` | Sector checkbox options |
| `GET` | `/api/profile` | Load profile + documents + completion |
| `PATCH` | `/api/profile` | Update text fields |
| `POST` | `/api/profile/documents` | Upload document (multipart) |
| `DELETE` | `/api/profile/documents/:id` | Delete **other** doc only |

---

## 1. Get sector options

```
GET /api/profile/sectors
Authorization: Bearer <token>
```

**Response `200`:**

```json
{
  "sectors": [
    "Agri-chemicals & Inputs",
    "Agri Technology & Precision Agriculture Solutions",
    "Food Processing & Value Addition"
  ]
}
```

---

## 2. Get profile

```
GET /api/profile
Authorization: Bearer <token>
```

**Role:** `party_a`

**Response `200`:**

```json
{
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
    "profile_complete": false,
    "created_at": "2026-06-04T10:00:00.000Z",
    "updated_at": "2026-06-04T11:00:00.000Z"
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
    }
  ],
  "completion": {
    "completion_pct": 78,
    "profile_complete": false,
    "checks": [
      { "key": "company_name", "label": "Company Name", "met": true },
      { "key": "fbr_certificate", "label": "FBR Taxpayer Registration Certificate", "met": false }
    ],
    "missing_fields": [
      "FBR Taxpayer Registration Certificate",
      "SECP Certificate of Incorporation"
    ],
    "mandatory_documents": {
      "fbr_certificate": null,
      "secp_certificate": null
    },
    "other_documents": []
  },
  "available_sectors": ["Agri-chemicals & Inputs", "..."]
}
```

Use `completion.mandatory_documents` for quick “uploaded / not uploaded” badges on FBR and SECP cards.

---

## 3. Update profile (text fields)

```
PATCH /api/profile
Authorization: Bearer <token>
Content-Type: application/json
```

**Role:** `party_a`

### Request body (send only fields you want to update)

```json
{
  "company_name": "Khan Industries Pvt Ltd",
  "registration_number": "123456",
  "address": "Lahore, Pakistan",
  "phone": "03001234567",
  "website": "https://khanindustries.com",
  "tax_id": "1234567-8",
  "secp_number": "0123456",
  "psw_id": "PSW-123",
  "company_description": "Agriculture with Artificial Intelligence",
  "sectors": ["Agri-chemicals & Inputs", "Food Processing & Value Addition"],
  "hs_codes": "1006.30",
  "fbr_certificate_issue_date": "2020-01-15",
  "fbr_tax_office": "Lahore",
  "secp_incorporation_date": "2018-06-01"
}
```

| Field | Notes |
|-------|-------|
| `sectors` | JSON array of sector names from `/api/profile/sectors` |
| `tax_id` | NTN — shown as “Tax ID” in UI |
| `secp_number` | SECP registration number (text) |
| `fbr_certificate_issue_date` | `YYYY-MM-DD` optional |
| `secp_incorporation_date` | `YYYY-MM-DD` optional |

**Response `200`:** same shape as GET profile + `"message": "Profile updated"`.

`company_name` and `phone` also sync to `users.organization` and `users.phone`.

---

## 4. Upload document

```
POST /api/profile/documents
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Role:** `party_a`

### Form fields

| Field | Required | Notes |
|-------|----------|-------|
| `document` | Yes | File (PDF/DOC/DOCX/image) |
| `doc_type` | Yes | `fbr_certificate` \| `secp_certificate` \| `other` |
| `title` | For `other` only | e.g. "Bank Statement" |
| `description` | No | Optional note |

### FBR upload example (Postman / FormData)

```
document: <file>
doc_type: fbr_certificate
```

### SECP upload example

```
document: <file>
doc_type: secp_certificate
```

### Other document example

```
document: <file>
doc_type: other
title: Environmental Clearance
description: NOC from EPA Punjab
```

**Response `201`:** full profile payload + `"document": { ... uploaded doc ... }`.

**Replace behaviour:** uploading a new `fbr_certificate` or `secp_certificate` **replaces** the previous file of that type.

---

## 5. Delete other document

```
DELETE /api/profile/documents/5
Authorization: Bearer <token>
```

**Role:** `party_a`  
Only `doc_type === other` can be deleted. FBR/SECP must be replaced via new upload.

**Response `200`:** updated profile payload + `"message": "Document deleted"`.

---

## Suggested UI flow

```
Page load → GET /api/profile + GET /api/profile/sectors (if not in profile response)
     ↓
User fills company form → PATCH /api/profile (on Save or debounced)
     ↓
User picks FBR file → POST /api/profile/documents (doc_type=fbr_certificate)
     ↓
User picks SECP file → POST /api/profile/documents (doc_type=secp_certificate)
     ↓
Optional: Add other docs → POST with doc_type=other + title
     ↓
Show completion bar from completion.completion_pct
Show missing_fields list until profile_complete === true
```

### Form layout (match reference screenshots)

**Company Information**
- Company Name *
- Registration Number
- Address *
- Phone *
- Website
- Tax ID (NTN) * — maps to `tax_id`
- SECP Number * — maps to `secp_number`
- PSW ID — maps to `psw_id`
- Company Description *
- Sectors * (checkboxes from `available_sectors`)
- HS CODE(s) — maps to `hs_codes`

**Mandatory Documents**
- FBR Taxpayer Registration Certificate — file upload + optional issue date + tax office
- SECP Certificate of Incorporation — file upload + optional incorporation date

**Other Documents**
- Title + file + optional description
- List with View / Delete per row

**Completion box (bottom)**
- Progress bar: `completion.completion_pct%`
- List `completion.missing_fields` when not 100%

---

## Errors

| Status | Example |
|--------|---------|
| `400` | `No profile fields provided to update` |
| `400` | `Invalid sector(s): ...` |
| `400` | `title is required for other documents` |
| `400` | `doc_type must be fbr_certificate, secp_certificate, or other` |
| `400` | `Mandatory certificates cannot be deleted...` |
| `403` | Non–Party A role |

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Party A | `partya@test.com` | `password123` |

### Quick Postman test

1. Login → copy token  
2. `GET /api/profile`  
3. `PATCH /api/profile` with company fields  
4. `POST /api/profile/documents` — upload FBR PDF  
5. `POST /api/profile/documents` — upload SECP PDF  
6. `GET /api/profile` — check `completion_pct` → 100 when all fields filled

---

## Frontend prompt (copy into Cursor)

```
Build Party A "My Profile" page for MOU Tracking System.

Stack: React (Vite) + Tailwind, API base http://localhost:5000
Auth: Bearer token from login (role party_a)
Follow STEP16_PARTY_A_PROFILE_API.md exactly.

Route: /dashboard/party-a/profile
Add sidebar link "My Profile" under Party A nav.

Features:
1. Load GET /api/profile on mount — pre-fill form
2. Sector checkboxes from available_sectors (multi-select)
3. PATCH /api/profile on "Save Changes" with all text fields
4. Two mandatory upload cards:
   - FBR Taxpayer Registration Certificate (doc_type=fbr_certificate)
     + tax_id field, optional fbr_certificate_issue_date, fbr_tax_office
   - SECP Certificate of Incorporation (doc_type=secp_certificate)
     + secp_number field, optional secp_incorporation_date
5. "Other Documents" section — title + file + optional description
   POST /api/profile/documents with doc_type=other
   List other_documents with view link + delete button (DELETE /api/profile/documents/:id)
6. Profile completion progress bar using completion.completion_pct
7. Show completion.missing_fields in a blue info box (like reference UI)
8. Show uploaded file name + "View document" link when mandatory doc exists
9. Green primary color #006435 to match existing dashboard
10. File input accept: .pdf,.doc,.docx,.jpg,.jpeg,.png,.webp

Do not block MOUS submission yet unless product asks — profile is separate from proposal flow.
```

---

## Notes

- Profile is **independent** of `/api/proposals` MOUS flow (no submit gate yet).
- **View profile (read-only):** Sector Lead + Super Admin → see **STEP16B_PARTY_A_PROFILE_VIEW_API.md**
- Files served at `http://localhost:5000/uploads/profiles/<filename>`.

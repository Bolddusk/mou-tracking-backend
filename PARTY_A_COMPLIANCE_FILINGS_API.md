# Party A — Compliance Filings (Self-Service) — Frontend Integration Guide

**Backend:** `http://localhost:5000`  
**Base path:** `/api/profile/compliance-filings`  
**Access:** `party_a` only (logged-in organization uploads **own** filings)  
**Auth:** `Authorization: Bearer <token>`

Super Admin oversight remains on `/api/admin/compliance-filings` — see [`AUDIT_ANNUAL_RETURN_API.md`](./AUDIT_ANNUAL_RETURN_API.md).

---

## What Party A uploads

Last **3 calendar years** × 2 document types = **6 slots per organization**:

| Type | `filing_type` key | Label |
|------|-------------------|-------|
| Audit Report | `audit_report` | Audit Report |
| Annual Return | `annual_return` | Annual Return |

Example years in 2026: **2025, 2024, 2023** (rolling — from `GET .../meta`).

**No `user_id` in body** — backend always uses the logged-in Party A account.

---

## Endpoints

### 1. Metadata

```
GET /api/profile/compliance-filings/meta
```

**Role:** `party_a`

**Response:**
```json
{
  "required_fiscal_years": [2025, 2024, 2023],
  "filing_types": [
    { "key": "audit_report", "label": "Audit Report" },
    { "key": "annual_return", "label": "Annual Return" }
  ],
  "slots_per_organization": 6,
  "access": "party_a_self"
}
```

---

### 2. My compliance matrix (3-year grid)

```
GET /api/profile/compliance-filings/matrix
```

**Role:** `party_a`

**Response:** Same shape as admin matrix, scoped to current user.

```json
{
  "user": {
    "id": 1,
    "full_name": "Party A Test User",
    "email": "partya@test.com",
    "organization": "Test Organization",
    "country": "Pakistan",
    "role": "party_a"
  },
  "required_fiscal_years": [2025, 2024, 2023],
  "required_slots": 6,
  "uploaded_count": 2,
  "missing_count": 4,
  "complete": false,
  "matrix": [
    {
      "fiscal_year": 2025,
      "audit_report": {
        "id": 1,
        "fiscal_year": 2025,
        "filing_type": "audit_report",
        "filing_type_label": "Audit Report",
        "file_url": "http://localhost:5000/uploads/compliance/abc.pdf",
        "original_filename": "audit-2025.pdf",
        "notes": null,
        "uploaded_at": "..."
      },
      "annual_return": null
    },
    { "fiscal_year": 2024, "audit_report": null, "annual_return": null },
    { "fiscal_year": 2023, "audit_report": null, "annual_return": null }
  ],
  "filings": [ "...flat list..." ]
}
```

---

### 3. Upload / replace

```
POST /api/profile/compliance-filings
Content-Type: multipart/form-data
```

**Role:** `party_a`

| Field | Required | Notes |
|-------|----------|-------|
| `document` | Yes | PDF, DOC, DOCX, JPG, PNG, WEBP (max 10MB) |
| `fiscal_year` | Yes | Must be one of `required_fiscal_years` |
| `filing_type` | Yes | `audit_report` or `annual_return` |
| `notes` | No | Optional note |

**Do NOT send `user_id`** — ignored if sent; ownership is always `req.user.id`.

**Replace:** Uploading again for same year + type updates the file.

**Response `201` / `200`:**
```json
{
  "message": "Filing uploaded",
  "filing": {
    "id": 1,
    "user_id": 1,
    "fiscal_year": 2025,
    "filing_type": "audit_report",
    "filing_type_label": "Audit Report",
    "file_url": "http://localhost:5000/uploads/compliance/abc.pdf",
    "original_filename": "audit-2025.pdf",
    "notes": null,
    "uploaded_by": 1,
    "uploaded_by_name": "Party A Test User",
    "uploaded_at": "...",
    "updated_at": "..."
  }
}
```

---

### 4. Delete own filing

```
DELETE /api/profile/compliance-filings/:id
```

**Role:** `party_a` — only if `filing.user_id === current user`.

**Response:**
```json
{ "message": "Filing deleted", "id": 1 }
```

---

## Admin vs Party A — quick reference

| Action | Party A | Super Admin |
|--------|---------|-------------|
| View own matrix | `GET /api/profile/compliance-filings/matrix` | — |
| View any org | — | `GET /api/admin/compliance-filings/users/:userId/matrix` |
| Upload own | `POST /api/profile/compliance-filings` | — |
| Upload for any org | — | `POST /api/admin/compliance-filings` (+ `user_id`) |
| All orgs overview | — | `GET /api/admin/compliance-filings/overview` |
| Delete own | `DELETE /api/profile/compliance-filings/:id` | — |
| Delete any | — | `DELETE /api/admin/compliance-filings/:id` |

---

## Suggested UI (Party A)

**Location:** Party A Dashboard or Profile page — section below FBR/SECP documents.

**Title:** `Compliance — Audit Reports & Annual Returns (Last 3 Years)`

**Progress:** `uploaded_count / required_slots` (e.g. `2/6`)

**Grid:**

| Year | Audit Report | Annual Return |
|------|--------------|---------------|
| 2025 | Upload / View / Replace / Delete | … |
| 2024 | … | … |
| 2023 | … | … |

---

## Frontend API module

Create `src/api/complianceFilings.js`:

```javascript
import client from './client'

const PARTY_A_BASE = '/api/profile/compliance-filings'
const ADMIN_BASE = '/api/admin/compliance-filings'

// Party A self-service
export async function getMyComplianceMeta() {
  const { data } = await client.get(`${PARTY_A_BASE}/meta`)
  return data
}

export async function getMyComplianceMatrix() {
  const { data } = await client.get(`${PARTY_A_BASE}/matrix`)
  return data
}

export async function uploadMyComplianceFiling(formData) {
  const { data } = await client.post(`${PARTY_A_BASE}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteMyComplianceFiling(id) {
  const { data } = await client.delete(`${PARTY_A_BASE}/${id}`)
  return data
}

// Super Admin (existing)
export async function getComplianceOverview() {
  const { data } = await client.get(`${ADMIN_BASE}/overview`)
  return data
}

export async function getComplianceMatrix(userId) {
  const { data } = await client.get(`${ADMIN_BASE}/users/${userId}/matrix`)
  return data
}

export async function uploadComplianceFilingForUser(formData) {
  const { data } = await client.post(`${ADMIN_BASE}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function deleteComplianceFiling(id) {
  const { data } = await client.delete(`${ADMIN_BASE}/${id}`)
  return data
}
```

---

## Frontend implementation prompt

Copy to your frontend agent:

---

**PROMPT: Party A Compliance Filings UI**

Implement self-service compliance uploads for Party A per `PARTY_A_COMPLIANCE_FILINGS_API.md`.

1. Create `src/api/complianceFilings.js` (see doc).

2. Create reusable `ComplianceFilingsPanel.jsx`:
   - Props: `mode: 'party_a' | 'admin'`, optional `userId` for admin
   - Party A: load `getMyComplianceMatrix()`
   - Admin: load `getComplianceMatrix(userId)`
   - Render 3×2 grid from `matrix`
   - Upload: `FormData` with `document`, `fiscal_year`, `filing_type`, optional `notes`
   - Party A upload: **no** `user_id`
   - Admin upload: include `user_id` in FormData
   - Delete with confirm modal

3. **Party A:** Add panel to profile or dashboard (`/dashboard/party-a` or profile settings).

4. **Super Admin:** Keep separate admin pages per `AUDIT_ANNUAL_RETURN_API.md` (can reuse same `ComplianceFilingsPanel` with `mode="admin"`).

5. Show progress badge: `{uploaded_count}/{required_slots}` and `complete` checkmark when 6/6.

6. File preview: open `file_url` in new tab or existing `FilePreviewModal`.

**Test users:**
- Party A: `partya@test.com` / `password123`
- Super Admin: `superadmin@test.com` / `password123`

**Migration (once):** `npm run db:migrate:compliance-filings`

---

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Invalid year/type or missing fields |
| 403 | Not `party_a`, or deleting another user's filing |
| 404 | Filing not found |
| 503 | Run `npm run db:migrate:compliance-filings` |

---

## Setup

```bash
npm run db:migrate:compliance-filings
```

No new migration for Party A routes — same `compliance_filings` table.

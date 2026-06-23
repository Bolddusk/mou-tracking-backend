# Audit Reports & Annual Returns (Last 3 Years) — API & Frontend Guide

**Backend:** `http://localhost:5000`  
**Base path:** `/api/admin/compliance-filings`  
**Access:** `super_admin` only (for now)  
**Auth:** `Authorization: Bearer <token>`

**Party A self-upload:** see [`PARTY_A_COMPLIANCE_FILINGS_API.md`](./PARTY_A_COMPLIANCE_FILINGS_API.md).

---

## Overview

Super Admin can upload and manage **compliance filings** per **Party A organization** (`party_a` users):

| Filing type | Key | Description |
|-------------|-----|-------------|
| Audit Report | `audit_report` | External / statutory audit report |
| Annual Return | `annual_return` | SECP / annual return filing |

**Required coverage:** last **3 calendar years** (rolling), e.g. in 2026 → **2025, 2024, 2023**.

Per organization: **6 slots** (3 years × 2 types).

Files stored under `uploads/compliance/`.

---

## Setup

```bash
npm run db:migrate:compliance-filings
```

---

## Endpoints

### 1. Metadata

```
GET /api/admin/compliance-filings/meta
```

**Response:**
```json
{
  "required_fiscal_years": [2025, 2024, 2023],
  "filing_types": [
    { "key": "audit_report", "label": "Audit Report" },
    { "key": "annual_return", "label": "Annual Return" }
  ],
  "slots_per_organization": 6,
  "access": "super_admin_only"
}
```

---

### 2. Overview (all Party A orgs)

```
GET /api/admin/compliance-filings/overview
```

**Response:**
```json
{
  "required_fiscal_years": [2025, 2024, 2023],
  "filing_types": ["audit_report", "annual_return"],
  "total_organizations": 2,
  "complete_organizations": 0,
  "incomplete_organizations": 2,
  "organizations": [
    {
      "user_id": 1,
      "full_name": "Party A Test User",
      "email": "partya@test.com",
      "organization": "Test Organization",
      "country": "Pakistan",
      "required_years": [2025, 2024, 2023],
      "required_slots": 6,
      "uploaded_count": 2,
      "missing_count": 4,
      "complete": false
    }
  ]
}
```

Use for Super Admin dashboard table: org list + progress badge (e.g. `2/6`).

---

### 3. Organization matrix (3-year grid)

```
GET /api/admin/compliance-filings/users/:userId/matrix
```

**Response:**
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
      "audit_report": { "id": 1, "file_url": "...", "original_filename": "audit-2025.pdf", "...": "..." },
      "annual_return": null
    },
    {
      "fiscal_year": 2024,
      "audit_report": null,
      "annual_return": null
    },
    {
      "fiscal_year": 2023,
      "audit_report": null,
      "annual_return": null
    }
  ],
  "filings": [ "...flat list..." ]
}
```

Use for detail page: **3 rows (years) × 2 columns (audit / annual return)** with upload/replace/delete per cell.

---

### 4. List filings (filters)

```
GET /api/admin/compliance-filings?user_id=1&fiscal_year=2025&filing_type=audit_report
```

All query params optional.

---

### 5. Upload / replace filing

```
POST /api/admin/compliance-filings
Content-Type: multipart/form-data
```

| Field | Required | Notes |
|-------|----------|-------|
| `document` | Yes | PDF, DOC, DOCX, JPG, PNG, WEBP (max 10MB) |
| `user_id` | Yes | `party_a` user id |
| `fiscal_year` | Yes | Must be one of `required_fiscal_years` |
| `filing_type` | Yes | `audit_report` or `annual_return` |
| `notes` | No | Optional admin note |

**Replace behavior:** same `user_id` + `fiscal_year` + `filing_type` → updates file (no duplicate row).

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
    "file_url": "http://localhost:5000/uploads/compliance/123.pdf",
    "original_filename": "audit-2025.pdf",
    "notes": null,
    "uploaded_by": 4,
    "uploaded_by_name": "Super Admin",
    "uploaded_at": "...",
    "updated_at": "..."
  }
}
```

---

### 6. Delete filing

```
DELETE /api/admin/compliance-filings/:id
```

---

## Party A user picker

```
GET /api/users?role=party_a
```

(Existing users API — super admin already has access.)

---

## UI suggestion (Super Admin)

**Nav:** Administration → **Compliance Filings** (`/dashboard/super-admin/compliance`)

### Page A — Overview
- Table: Organization | Email | Progress (e.g. 4/6) | Status badge | View
- Summary cards: total orgs, complete, incomplete

### Page B — Organization detail
- Header: org name + email
- Grid:

| Year | Audit Report | Annual Return |
|------|--------------|---------------|
| 2025 | [Upload / View / Delete] | [Upload / View / Delete] |
| 2024 | ... | ... |
| 2023 | ... | ... |

- Upload modal: year + type pre-filled from cell click, file picker, optional notes

---

## Frontend implementation prompt

Copy to frontend agent:

---

**PROMPT: Super Admin — Audit Reports & Annual Returns (3 years)**

Build a Super Admin module for compliance filings per `AUDIT_ANNUAL_RETURN_API.md`.

**Routes (super admin shell only):**
- `/dashboard/super-admin/compliance` — overview list
- `/dashboard/super-admin/compliance/:userId` — 3-year matrix for one Party A org

**API module** `src/api/complianceFilings.js`:
- `getComplianceMeta()`
- `getComplianceOverview()`
- `getComplianceMatrix(userId)`
- `uploadComplianceFiling(formData)` → POST multipart to `/api/admin/compliance-filings`
- `deleteComplianceFiling(id)`

**Overview page:**
- Load `GET /api/admin/compliance-filings/overview`
- Show organizations with `uploaded_count / required_slots`
- Link to detail page

**Detail page:**
- Load `GET /api/admin/compliance-filings/users/:userId/matrix`
- Render 3×2 grid from `matrix` array
- Empty cell → Upload button (opens file input + optional notes)
- Filled cell → View file (open `file_url`), Replace, Delete
- Use `FormData`: `document`, `user_id`, `fiscal_year`, `filing_type`, `notes`

**Sidebar:** add under ADMINISTRATION:
`Compliance Filings` (super admin only)

**Test:** `superadmin@test.com` / `password123`, upload for `partya@test.com` (user_id=1)

Do not expose this menu to other roles yet.

---

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Invalid year, type, or non-party_a user |
| 403 | Not super admin |
| 404 | User or filing not found |
| 503 | Table missing — run migration |

---

## Future (not implemented)

- Party A self-upload on profile
- Investor / China org compliance
- Fiscal year July–June (Pakistan FY) instead of calendar year

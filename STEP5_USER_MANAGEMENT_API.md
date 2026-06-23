# Step 5 — Super Admin User Management (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`  
**Role:** All endpoints below require **`super_admin`**

Use this document to build the **Users** section on the Super Admin dashboard (list, view, add, edit, change role, reset password, delete).

---

## Overview

| Action | Method | Endpoint |
|--------|--------|----------|
| List roles (dropdown) | GET | `/api/users/roles` |
| List all users | GET | `/api/users` |
| View user + stats | GET | `/api/users/:id` |
| Add user | POST | `/api/users` |
| Update profile | PATCH | `/api/users/:id` |
| Change role | PATCH | `/api/users/:id/role` |
| Reset password | PATCH | `/api/users/:id/password` |
| Issue Party B login | POST | `/api/users/:id/issue-credentials` |
| Delete user | DELETE | `/api/users/:id` |

**Note:** `GET /api/users/sector-leads` and `GET /api/users/regional-focal-points` remain unchanged (used by complaint forms).

---

## Available roles

**`GET /api/users/roles`**

```json
[
  { "value": "super_admin", "label": "Super Admin", "requires_sector": false },
  { "value": "admin", "label": "Admin", "requires_sector": false },
  { "value": "sector_lead", "label": "Sector Lead", "requires_sector": true },
  { "value": "regional_focal_point", "label": "Regional Focal Point", "requires_sector": true },
  { "value": "party_a", "label": "Party A", "requires_sector": false },
  { "value": "party_b", "label": "Party B", "requires_sector": false }
]
```

When `requires_sector: true`, the form must collect **sector** (e.g. `Energy & Power`, `Punjab Region`).

---

## List users

**`GET /api/users`**

### Query params (optional)

| Param | Example | Description |
|-------|---------|-------------|
| `role` | `party_a` | Filter by role |
| `search` | `khan` | Search name, email, or organization |

```
GET /api/users?role=sector_lead
GET /api/users?search=rfp
```

### Response `200`

```json
[
  {
    "id": 1,
    "full_name": "Party A — Ali Khan",
    "email": "partya@test.com",
    "role": "party_a",
    "role_label": "Party A",
    "sector": null,
    "organization": "Khan Industries Pvt Ltd",
    "phone": "03001234567",
    "created_at": "2026-06-01T..."
  }
]
```

Password is **never** returned.

---

## View user (detail)

**`GET /api/users/:id`**

### Response `200`

```json
{
  "id": 3,
  "full_name": "Energy Sector Lead",
  "email": "sectorlead@test.com",
  "role": "sector_lead",
  "role_label": "Sector Lead",
  "sector": "Energy & Power",
  "organization": "Ministry of Energy",
  "phone": "03007654321",
  "created_at": "2026-06-01T...",
  "stats": {
    "proposals_filed": 0,
    "proposals_reviewed": 4,
    "complaints_filed": 0,
    "complaints_tagged": 2,
    "complaints_forwarded": 0,
    "activities_added": 5
  }
}
```

Use `stats` on the user detail page to show activity summary and to warn before delete.

---

## Add user

**`POST /api/users`**

### Request

```json
{
  "full_name": "New Sector Lead",
  "email": "newlead@test.com",
  "password": "password123",
  "role": "sector_lead",
  "sector": "Energy & Power",
  "organization": "Ministry of Energy",
  "phone": "03001112233"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `full_name` | Yes | |
| `email` | Yes | Unique, stored lowercase |
| `password` | Yes | Min 6 characters |
| `role` | Yes | One of roles from `/roles` |
| `sector` | If sector_lead / regional_focal_point | |
| `organization` | No | |
| `phone` | No | |

### Response `201`

Created user object (same shape as list item).

### Errors

| Status | Reason |
|--------|--------|
| 400 | Missing fields, invalid role, missing sector |
| 409 | Email already exists |

---

## Update profile

**`PATCH /api/users/:id`**

Does **not** change role or password — use dedicated endpoints for those.

### Request (any combination)

```json
{
  "full_name": "Updated Name",
  "email": "updated@test.com",
  "organization": "New Org",
  "phone": "03009998877",
  "sector": "Tourism & Hospitality"
}
```

If user role is `sector_lead` or `regional_focal_point`, `sector` cannot be cleared.

### Response `200`

Updated user object.

---

## Change role

**`PATCH /api/users/:id/role`**

### Request

```json
{
  "role": "regional_focal_point",
  "sector": "Punjab Region"
}
```

| Field | Required |
|-------|----------|
| `role` | Yes |
| `sector` | Yes when new role requires sector |

### Rules

- Cannot demote the **last** super admin
- Cannot remove **your own** super admin role
- Changing to non-sector role clears `sector` in DB

### Response `200`

Updated user object.

---

## Reset password

**`PATCH /api/users/:id/password`**

### Request

```json
{
  "password": "newpassword123"
}
```

Min 6 characters.

### Response `200`

```json
{ "message": "Password updated successfully" }
```

---

## Delete user

**`DELETE /api/users/:id`**

### Rules

- Cannot delete **yourself**
- Cannot delete the **last** super admin
- Cannot delete if user has portal records (proposals, complaints, activities, etc.)

### Response `200`

```json
{
  "message": "User deleted successfully",
  "id": 7
}
```

### Error `400` — has records

```json
{
  "error": "Cannot delete user with existing portal records",
  "references": {
    "proposals_filed": 2,
    "proposals_reviewed": 0,
    "complaints_filed": 1,
    "complaints_tagged": 0,
    "complaints_forwarded": 0,
    "activities_added": 3
  }
}
```

Show this breakdown in the UI so admin knows why delete failed.

---

## Frontend API module

```js
// src/api/users.js

import client from './client'

export async function getSectorLeads() {
  const { data } = await client.get('/api/users/sector-leads')
  return data
}

export async function getRegionalFocalPoints() {
  const { data } = await client.get('/api/users/regional-focal-points')
  return data
}

// --- Super Admin only ---

export async function getUserRoles() {
  const { data } = await client.get('/api/users/roles')
  return data
}

export async function listUsers(params = {}) {
  const { data } = await client.get('/api/users', { params })
  return data
}

export async function getUserById(id) {
  const { data } = await client.get(`/api/users/${id}`)
  return data
}

export async function createUser(payload) {
  const { data } = await client.post('/api/users', payload)
  return data
}

export async function updateUser(id, payload) {
  const { data } = await client.patch(`/api/users/${id}`, payload)
  return data
}

export async function changeUserRole(id, role, sector) {
  const { data } = await client.patch(`/api/users/${id}/role`, { role, sector })
  return data
}

export async function resetUserPassword(id, password) {
  const { data } = await client.patch(`/api/users/${id}/password`, { password })
  return data
}

export async function deleteUser(id) {
  const { data } = await client.delete(`/api/users/${id}`)
  return data
}
```

---

## Suggested UI pages

### 1. Users list — `/admin/users`

- Table: Name, Email, Role, Sector, Organization, Created, Actions
- Filters: role dropdown + search box
- **Add User** button → modal or `/admin/users/new`
- Row actions: View, Edit, Change Role, Delete

### 2. User detail — `/admin/users/:id`

- Profile card (all fields except password)
- Stats grid from `stats`
- Buttons: Edit profile, Change role, Reset password
- Delete (disabled or warning if `stats` total > 0)

### 3. Add / Edit user form

```
Full Name *
Email *
Password *          (add only, or separate reset on edit)
Role *              (dropdown from GET /roles)
Sector              (show only if role.requires_sector)
Organization
Phone
```

On role change in form, toggle sector field using `requires_sector` from `/roles`.

### 4. Change role modal

- Role dropdown
- Sector input (conditional)
- Confirm button → `PATCH /:id/role`

### 5. Reset password modal

- New password + confirm
- `PATCH /:id/password`

### 6. Delete confirmation

- If `GET /:id` stats show any count > 0, show:
  > This user cannot be deleted — linked to X proposals, Y complaints, etc.
- Otherwise confirm → `DELETE /:id`

---

## Sidebar (Super Admin)

Add nav item:

```
Dashboard
Complaints
Users          ← new
```

Route guard: only render for `role === 'super_admin'`.

---

## Role badge colors (suggestion)

| role | Color |
|------|-------|
| `super_admin` | Dark / slate |
| `admin` | Gray |
| `sector_lead` | Teal |
| `regional_focal_point` | Purple |
| `party_a` | Blue |
| `party_b` | Indigo |

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `superadmin@test.com` | `password123` |

### Quick test

1. Login as Super Admin  
2. `GET /api/users` — see all seeded users  
3. `POST /api/users` — create test `admin` user  
4. `GET /api/users/:id` — view with stats  
5. `PATCH /api/users/:id/role` — change role  
6. `PATCH /api/users/:id/password` — reset password  
7. Try `DELETE` on user with proposals → expect 400 with `references`  
8. `DELETE` unused test user → success  

---

## Error responses

| Status | Examples |
|--------|----------|
| 400 | Validation, last super admin, self-delete, user has records |
| 401 | Missing / invalid token |
| 403 | Not super admin |
| 404 | User not found |
| 409 | Duplicate email |

---

## Related docs

- `STEP4_COMPLAINTS_API.md` — uses `GET /api/users/sector-leads`
- `FRONTEND_INTEGRATION.md` — Party A registration (public, not admin create)

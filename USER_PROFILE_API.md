# User Profile & Account APIs (All Roles incl. Super Admin)

**Backend:** `http://localhost:5000`  
**Base path:** `/api/auth`  
**Auth:** `Authorization: Bearer <token>`

Same endpoints for **every logged-in role** (`super_admin`, `party_a`, `sector_lead`, `investor`, etc.).

---

## Summary

| Action | Method | Endpoint | Status |
|--------|--------|----------|--------|
| View profile | `GET` | `/api/auth/me` | ✅ Exists |
| Edit profile | `PATCH` | `/api/auth/me` | ✅ New |
| Change password | `PATCH` | `/api/auth/change-password` | ✅ Exists |
| Log out | — | Frontend only (clear token) | — |

**Note:** `role`, `sector`, `country` are **not** self-editable — Super Admin changes those via `PATCH /api/users/:id` (admin only).

---

## 1. View profile

```
GET /api/auth/me
```

**Response:**
```json
{
  "user": {
    "id": 4,
    "full_name": "Super Admin",
    "email": "superadmin@test.com",
    "role": "super_admin",
    "sector": null,
    "country": null,
    "organization": "Investment Portal HQ",
    "phone": "03009998877",
    "must_change_password": false,
    "created_at": "2026-06-22T10:00:00.000Z"
  },
  "redirect": "/dashboard/super-admin"
}
```

---

## 2. Edit profile (self)

```
PATCH /api/auth/me
Content-Type: application/json
```

**Editable fields:**

| Field | Type | Notes |
|-------|------|-------|
| `full_name` | string | Required if sent; non-empty |
| `email` | string | Valid email; unique; returns **new JWT** if changed |
| `organization` | string | Optional |
| `phone` | string | Optional |

**Example:**
```json
{
  "full_name": "Hasnain Lodhi",
  "organization": "Investment Portal HQ",
  "phone": "03009998877"
}
```

**Response:**
```json
{
  "message": "Profile updated successfully",
  "user": { "...updated user..." },
  "redirect": "/dashboard/super-admin",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

`token` is only included when **email** changes — frontend must save new token.

**Errors:** `400` no fields | `409` email taken

---

## 3. Change password

```
PATCH /api/auth/change-password
Content-Type: application/json
```

```json
{
  "current_password": "password123",
  "new_password": "newSecurePass456"
}
```

**Rules:**
- `new_password` min 6 characters
- Must differ from `current_password`

**Response:**
```json
{
  "message": "Password changed successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "...user with must_change_password: false..." },
  "redirect": "/dashboard/super-admin"
}
```

Always save the new `token` after password change.

---

## Super Admin — admin-only extras

These are **not** self-profile — for managing **other** users:

| Action | Endpoint |
|--------|----------|
| List users | `GET /api/users` |
| View user | `GET /api/users/:id` |
| Edit any user | `PATCH /api/users/:id` |
| Change role | `PATCH /api/users/:id/role` |
| Reset password | `PATCH /api/users/:id/password` |

---

## Frontend integration

### API module (`src/api/auth.js`)

```javascript
import client from './client'

export async function getMe() {
  const response = await client.get('/api/auth/me')
  return response.data
}

export async function updateProfile(data) {
  const response = await client.patch('/api/auth/me', data)
  return response.data
}

export async function changePassword(current_password, new_password) {
  const response = await client.patch('/api/auth/change-password', {
    current_password,
    new_password,
  })
  return response.data
}
```

### Suggested pages

| Route | Purpose |
|-------|---------|
| `/profile` or `/account` | View + edit profile form |
| `/auth/change-password` | Already exists in app |

### Profile page flow

1. On mount: `GET /api/auth/me` → populate form
2. Save: `PATCH /api/auth/me` with changed fields only
3. If response includes `token` → update `localStorage` + `AuthContext`
4. Show success toast

### Header dropdown (screenshot)

- **View / Edit Profile** → `/profile`
- **Change Password** → `/auth/change-password` (already linked)
- **Log out** → clear token + redirect login

---

## Frontend prompt

Copy to frontend agent:

---

**PROMPT: User Profile page (Super Admin + all roles)**

Implement account profile using `USER_PROFILE_API.md`.

1. Add `updateProfile()` to `src/api/auth.js`.

2. Create `src/pages/account/Profile.jsx`:
   - Load `getMe()` on mount
   - Read-only: `role`, `sector`, `country`, `created_at`
   - Editable: `full_name`, `email`, `organization`, `phone`
   - Save → `updateProfile()`; if `token` in response, call auth context to refresh token

3. Wire routes in `App.jsx` (all authenticated roles):
   - `/profile` → `Profile` page inside `ProtectedRoute`

4. Update header user dropdown (`DashboardLayout.jsx`):
   - Add **My Profile** link → `/profile`
   - Keep **Change Password** → `/auth/change-password`
   - Keep **Log out**

5. Reuse existing `ChangePassword.jsx` — no backend changes needed.

**Test:** `superadmin@test.com` / `password123`

---

## Errors

| Status | Meaning |
|--------|---------|
| 401 | Invalid/expired token or wrong current password |
| 400 | Validation / no fields to update |
| 409 | Email already in use |

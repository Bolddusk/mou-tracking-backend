# Step 6 — Password Change Flow (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Frontend:** `http://localhost:5173`  
**Auth:** `Authorization: Bearer <token>`

Party B accounts created on proposal approval receive a **temporary password** by email. They must change it on first login before accessing the dashboard.

All logged-in users may also change password voluntarily.

---

## Setup

```bash
cd investment-portal-backend
npm run db:migrate:password-change
npm run dev
```

Adds column: `users.must_change_password` (0 | 1)

New Party B auto-accounts are created with `must_change_password = 1`.

---

## How it works

```
Proposal approved → Party B account created (must_change_password = 1)
       ↓
Email with temporary password
       ↓
Party B logs in → redirect /auth/change-password (forced)
       ↓
PATCH /api/auth/change-password → must_change_password = 0
       ↓
Redirect /dashboard/party-b
```

---

## Login response (Party B first time)

**`POST /api/auth/login`**

```json
{
  "token": "eyJ...",
  "user": {
    "id": 8,
    "full_name": "Li Wei",
    "email": "liwei@company.cn",
    "role": "party_b",
    "must_change_password": true
  },
  "redirect": "/auth/change-password"
}
```

When `must_change_password` is `false`, `redirect` is the role dashboard (e.g. `/dashboard/party-b`).

---

## Change password

**`PATCH /api/auth/change-password`**  
**Auth:** any logged-in user

### Request

```json
{
  "current_password": "xK9mP2nQ4r",
  "new_password": "mySecurePass99"
}
```

| Field | Rules |
|-------|-------|
| `current_password` | Required — must match DB |
| `new_password` | Min 6 chars, must differ from current |

### Response `200`

```json
{
  "message": "Password changed successfully",
  "token": "eyJ...",
  "user": {
    "id": 8,
    "role": "party_b",
    "must_change_password": false
  },
  "redirect": "/dashboard/party-b"
}
```

Replace stored JWT and user after success (new token issued).

### Errors

| Status | Reason |
|--------|--------|
| 400 | Missing fields, password too short, same as current |
| 401 | Wrong current password |
| 401 | No / invalid token |

---

## Get current profile

**`GET /api/auth/me`**  
**Auth:** required

```json
{
  "user": {
    "id": 8,
    "email": "liwei@company.cn",
    "role": "party_b",
    "must_change_password": true
  },
  "redirect": "/auth/change-password"
}
```

Use on app load to refresh `must_change_password` if needed.

---

## Frontend integration

### API helpers

```js
// src/api/auth.js

export async function changePassword(current_password, new_password) {
  const { data } = await client.patch('/api/auth/change-password', {
    current_password,
    new_password,
  })
  return data
}

export async function getMe() {
  const { data } = await client.get('/api/auth/me')
  return data
}
```

### Auth context

```js
// After login
if (data.user?.must_change_password) {
  navigate('/auth/change-password')
}

// changePassword action
const data = await authApi.changePassword(current, newPass)
persistAuth(data.token, data.user)
navigate(data.redirect)
```

Expose:

```js
mustChangePassword: Boolean(user?.must_change_password)
```

### Route guard

Block dashboard routes when `must_change_password === true`:

```js
// ProtectedRoute — redirect to /auth/change-password
// Except the change-password page itself (allowPasswordChange flag)
```

### Page: `/auth/change-password`

| Field | Notes |
|-------|-------|
| Current password | Temporary password from email |
| New password | Min 6 |
| Confirm new password | Client-side match check |

**Forced mode** (`must_change_password`):
- Amber banner: temporary password — set new password to continue
- No "back to dashboard" until password changed
- Show "Sign out" link

**Voluntary mode** (Party B sidebar link):
- "Back to dashboard" link

### Sidebar (Party B)

Add nav link: **Change Password** → `/auth/change-password`

---

## UI copy (suggested)

**Forced banner:**

> You signed in with a temporary password sent by email. Please set a new password to continue.

**Success:**

> Password updated successfully — redirecting to your dashboard…

---

## Test flow

1. Approve a proposal with new Party B email (see `STEP5B_PARTY_B_API.md`)
2. Login with emailed temporary password
3. Confirm redirect to `/auth/change-password` (not dashboard)
4. Try opening `/dashboard/party-b` directly → redirected back to change password
5. Submit new password → lands on Party B dashboard
6. Logout, login with **new** password → goes straight to dashboard
7. Use sidebar **Change Password** to update again voluntarily

---

## Security notes

- Raw temporary password is **never** stored in DB (only bcrypt hash)
- After change, only the new hash is kept
- New JWT issued after password change
- Works for any role (not only Party B) if you expose the page

---

## Related docs

- **`STEP5B_PARTY_B_API.md`** — Party B auto-account + invite email
- **`STEP5_USER_MANAGEMENT_API.md`** — Super Admin can reset passwords (separate admin endpoint)

---

## Suggested Step 7

**Regional Focal Point dashboard polish** — dedicated landing, stats, and navigation improvements (backend APIs largely exist from Step 4b).

After that: matching algorithm / rooms / chat (deferred scope).

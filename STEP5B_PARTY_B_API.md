# Step 5b — Party B Auto-Account & Portal Access (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Frontend:** `http://localhost:5173`  
**Auth:** `Authorization: Bearer <token>`

When a proposal is **approved**, the backend auto-creates (or links) a **Party B** user and emails login credentials. Party B can then use the portal like Party A **except** creating new proposals.

---

## Setup

```bash
cd investment-portal-backend
npm install nodemailer
npm run db:migrate:party-b
```

### `.env` (email — required for credentials email)

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=Investment Portal <your@gmail.com>
CLIENT_LOGIN_URL=http://localhost:5173/auth/login
PORTAL_NAME=Pakistan-China Investment Portal
```

Email failure **does not block** approval — account is still created and linked.

---

## Approval flow (automatic)

**`PATCH /api/proposals/:id/approve`** (unchanged URL — sector lead / super admin)

After `status = 'approved'`:

1. If user exists with `email = proposal.party_b_email` → link only (`party_b_user_id`)
2. Else → create `party_b` user with random 10-char password
3. `UPDATE proposals SET party_b_user_id = ?`
4. Send HTML email with credentials (new accounts only)

### Response `200`

```json
{
  "message": "Proposal approved — Party B credentials in response (share with Party B)",
  "proposal": { "id": 1, "status": "approved", "party_b_user_id": 8 },
  "party_b": {
    "linked": true,
    "user_id": 8,
    "account_created": true,
    "existing_account": false,
    "email_sent": false,
    "credentials": {
      "email": "liwei@company.cn",
      "temporary_password": "xK9mP2nQ4r",
      "login_url": "http://localhost:5173/auth/login",
      "must_change_password": true
    }
  }
}
```

**`party_b.credentials`** is included when:
- New Party B account is created, **and**
- Email is not configured **or** email send failed, **or** `RETURN_PARTY_B_CREDENTIALS_IN_RESPONSE=true`

Set `RETURN_PARTY_B_CREDENTIALS_IN_RESPONSE=false` in production when email works (password not returned in API).

**Existing account linked** (`existing_account: true`) — no password in response. Use **Issue credentials** API below.

| `party_b` field | Meaning |
|-----------------|---------|
| `account_created` | New user was created |
| `email_sent` | Invite email delivered |
| `skipped` | No email/name on proposal |

Show `message` in sector lead / super admin success toast after approve.

---

## Party B login

**`POST /api/auth/login`**

```json
{ "email": "partyb@company.cn", "password": "xK9mP2nQ4r" }
```

Response includes:

```json
{
  "token": "...",
  "user": { "role": "party_b", "full_name": "...", "email": "..." },
  "redirect": "/dashboard/party-b"
}
```

Frontend: redirect `party_b` → **`/dashboard/party-b`**

---

## Party B permissions

| Feature | Party A | Party B |
|---------|---------|---------|
| `GET /api/proposals/my` | `party_a_id` | `party_b_user_id` |
| `POST /api/proposals/draft` | Yes | **No** |
| `POST /api/proposals/submit` | Yes | **No** |
| `GET /api/proposals/:id` | Own | Linked only |
| Add activities / comments | Yes | Yes |
| Respond to poke | Yes | **No** (Party A only) |
| File complaint | Yes | Yes (linked proposals) |
| Approve / reject anything | No | No |

---

## APIs Party B uses

### Proposals

```
GET  /api/proposals/my          → linked proposals
GET  /api/proposals/:id         → detail (3 steps)
GET  /api/proposals/:id/activities
POST /api/proposals/:id/activities
```

### Activities

```
POST /api/activities/upload
POST /api/activities/:id/comments
```

Not allowed: `POST /api/activities/:id/respond` (poke — Party A only)

### Complaints

```
GET  /api/complaints/my
POST /api/complaints
POST /api/complaints/upload
GET  /api/complaints/:id
POST /api/complaints/:id/comments
```

When filing complaint, proposal must have `party_b_user_id = current user`.

---

## Frontend routes

| Path | Role |
|------|------|
| `/dashboard/party-b` | `party_b` |
| `/proposals/:id` | `party_a`, `party_b`, `sector_lead`, `super_admin` |
| `/complaints` | `party_a`, `party_b`, + reviewers |
| `/complaints/new` | `party_a`, `party_b` |

**Not available to Party B:**
- `/proposals/new`
- Sidebar "New Opportunity"

---

## Party B dashboard UI

**`/dashboard/party-b`**

Tabs:
1. **My Proposals** — table from `GET /api/proposals/my`
2. **My Complaints** — table from `GET /api/complaints/my`

Columns (proposals): Title | Sector | Status | Poke | Date | View

**No** "Add New Opportunity" button.

Empty state:

> No proposals linked yet. You will receive an email when a proposal is approved with your Party B details.

---

## Proposal detail (Party B)

Same page as Party A with restrictions:

- Show full `ProposalDetailPanel` (all 3 steps)
- **+ Add Activity** — allowed
- Activity comments — allowed
- **Respond to Poke** — hidden (Party A only)
- **Poke for Update** — hidden (reviewers only)

---

## Auth context helpers

```js
// After login / in AuthContext
isPartyB: user?.role === 'party_b'
isPartyMember: party_a || party_b
dashboardPath: party_b → '/dashboard/party-b'
```

```js
// constants/sectors.js
ROLES.PARTY_B = 'party_b'
ROLE_LABELS.party_b = 'Party B'
```

---

## Email content (what Party B receives)

- Portal name + branding block
- Proposal title + sector
- Email + temporary password
- Login URL (`CLIENT_LOGIN_URL`)
- Note: change password after first login — see **`STEP6_PASSWORD_CHANGE_API.md`**

---

## Test flow

1. Party A submits proposal with Party B email `newpartyb@test.com`
2. Sector Lead approves proposal
3. Check email (or logs if SMTP not configured)
4. Login as Party B with emailed credentials → `/dashboard/party-b`
5. View linked proposal → add activity → file complaint
6. Confirm Party B cannot access `/proposals/new` or other proposals

### Re-approve / existing email

If `party_b_email` already exists in `users` table → account **not** duplicated, only `party_b_user_id` linked. No new password email.

---

## DB changes

```sql
ALTER TABLE proposals ADD COLUMN party_b_user_id INT NULL;
-- FK to users(id)

-- ENUM updates: party_b added to activity/complaint comment roles
```

---

## Issue credentials (existing Party B — Super Admin)

When Party B email already exists in `users` (linked, not created), approve returns no password.

**`POST /api/users/:id/issue-credentials`**  
**Role:** `super_admin`  
**User must be:** `party_b`

Generates new temporary password, sets `must_change_password = 1`.

### Response `200`

```json
{
  "message": "Temporary Party B credentials issued",
  "user_id": 7,
  "full_name": "Li Wei",
  "credentials": {
    "email": "agentaaugmenteck@yopmail.com",
    "temporary_password": "aB3cD9fG2h",
    "login_url": "http://localhost:5173/auth/login",
    "must_change_password": true
  }
}
```

**Frontend:** Users → Party B user → **Issue Party B Login** button → credentials modal.

---

## Related docs

- `FRONTEND_INTEGRATION.md` — Party A 3-step form (Party B fields in step 2)
- `STEP2_SECTOR_REVIEW_API.md` — approve/reject proposals
- `STEP3_ACTIVITIES_API.md` — activity timeline
- `STEP4_COMPLAINTS_API.md` — complaints
- `STEP5_USER_MANAGEMENT_API.md` — super admin user CRUD

# Step 3 — Proposal Activity / Update System (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Paste this into Cursor to build `/proposals/:id` detail page with activity timeline.

---

## Setup

```bash
cd investment-portal-backend
npm run db:migrate:activities
npm run dev
```

---

## Poke status in list APIs

Every proposal list/detail now includes `poke_status`:

```json
{
  "poke_status": {
    "status": "none | pending_response | answered",
    "poked_by_name": "Super Admin",
    "poked_by_role": "super_admin",
    "poked_by_label": "Super Admin",
    "poked_at": "2026-06-04T...",
    "answered_at": "2026-06-05T...",
    "label": "Super Admin poked — Awaiting Party A response",
    "short_label": "Poked by Super Admin · Pending"
  }
}
```

| status | Table badge | Meaning |
|--------|-------------|---------|
| `none` | — | No poke yet |
| `pending_response` | Amber | Sector Lead / Super Admin poked, Party A has not added update |
| `answered` | Teal | Party A added activity after poke |

**Logic:** Latest poke activity (`title = "Update Requested"`). If Party A adds any activity after that poke → `answered`.

Applies to: `GET /api/proposals/my`, `/sector-lead`, `/all`, `/:id`

**Frontend:** Show `Poke` column with `PokeStatusBadge` component.

---

## Flow

```
Party A / Sector Lead / Super Admin
        ↓
Add activity update (date, title, description) → status: pending
        ↓
Sector Lead OR Super Admin → Approve / Reject activity
        ↓
Anyone with access → Add comments on activity
        ↓
Sector Lead / Super Admin → "Poke for Update" (system activity)
```

**Permanent audit trail** — no DELETE routes. All approvals stored in `activity_approvals`.

---

## Access rules

| Role | View proposal | Add activity | Comment | Approve/Reject activity | Poke |
|------|---------------|--------------|---------|-------------------------|------|
| party_a | own only | own proposals | ✅ | ❌ | ❌ |
| sector_lead | own sector (not draft) | own sector | ✅ | ✅ own sector | ✅ own sector |
| super_admin | all | all | ✅ | ✅ all | ✅ all |

---

## APIs

### GET `/api/proposals/:id`

**Roles:** `party_a` | `sector_lead` | `super_admin`  
Returns full proposal (same as Step 2).

---

### GET `/api/proposals/:proposalId/activities`

**Roles:** `party_a` | `sector_lead` | `super_admin`  
Same access as proposal detail.

**Response 200:**
```json
{
  "activities": [
    {
      "id": 1,
      "proposal_id": 5,
      "added_by": 2,
      "added_by_role": "party_a",
      "added_by_name": "Ali Khan",
      "activity_date": "2026-01-15",
      "title": "Progress Update Q1",
      "description": "Construction 40% complete",
      "status": "pending",
      "created_at": "...",
      "approvals": [
        {
          "id": 1,
          "action": "approved",
          "comment": "Verified",
          "action_by_name": "Energy Sector Lead",
          "action_by_role": "sector_lead",
          "actioned_at": "..."
        }
      ],
      "comments": [
        {
          "id": 1,
          "comment": "Please share photos",
          "commented_by_name": "Super Admin",
          "commented_by_role": "super_admin",
          "created_at": "..."
        }
      ]
    }
  ]
}
```

**Sort:** `activity_date ASC` (oldest first — history chain)

---

### POST `/api/proposals/:proposalId/activities`

**Body:**
```json
{
  "activity_date": "2025-06-01",
  "title": "Site visit completed",
  "description": "What was done on that date",
  "support_file_url": "http://localhost:5000/uploads/proof.pdf",
  "comment": "Optional note saved as first comment"
}
```

- `activity_date` — past dates allowed (actual work date)
- `title` — required
- `support_file_url` — optional, from upload endpoint below
- `comment` — optional, auto-creates first activity comment

### POST `/api/activities/upload`

**Roles:** `party_a` | `sector_lead` | `super_admin`  
**Form-data:** field `support_file` (PDF/DOC/DOCX, max 10MB)

**Response:** `{ "file_url": "http://localhost:5000/uploads/..." }`

**Party A poke response flow:**
1. See amber banner "Update requested"
2. Click **Respond to Poke**
3. Pick past work date + title + description
4. Upload proof document
5. Add optional comment → Submit
6. Table `poke_status` becomes **Answered**

**Response 201:** single activity with empty approvals/comments arrays

---

### POST `/api/proposals/:proposalId/poke`

**Roles:** `sector_lead` | `super_admin`

Creates system activity:
- title: `"Update Requested"`
- description: `"Please provide latest update on this proposal"`
- activity_date: today
- status: `pending`

**Response 201:** created activity

---

### PATCH `/api/activities/:activityId/approve`

**Roles:** `sector_lead` | `super_admin`

**Body:** `{ "comment": "optional" }`

- Activity must be `pending`
- Sector lead: proposal sector must match

**Response 200:** updated activity with new approval record

---

### PATCH `/api/activities/:activityId/reject`

**Roles:** `sector_lead` | `super_admin`

**Body:** `{ "comment": "required" }` — 400 if missing

**Response 200:** updated activity

---

### POST `/api/activities/:activityId/comments`

**Roles:** `party_a` | `sector_lead` | `super_admin`

**Body:** `{ "comment": "text" }` — required

**Response 201:**
```json
{
  "id": 1,
  "activity_id": 5,
  "comment": "Looks good",
  "commented_by": 3,
  "commented_by_role": "super_admin",
  "commented_by_name": "Super Admin",
  "created_at": "..."
}
```

---

### GET `/api/activities/:activityId/comments`

**Roles:** same as above  
**Response 200:** comments array (also included in GET activities)

---

## Frontend page: `/proposals/:id`

**Route:** all 3 roles (access enforced by API)

### Top section
- Proposal title, sector, status badge
- Party B info, MOU info (reuse `ProposalDetailPanel`)
- **Poke for Update** — sector_lead + super_admin only
- **Add Activity Update** — all 3 roles

### Activity Timeline (vertical)
Each card:
- Date (`activity_date`)
- Title + description
- Added by (name + role badge)
- Status badge: pending=yellow, approved=green, rejected=red
- Approve / Reject — sector_lead + super_admin, only if `status=pending`
- Collapsible comments list + add comment input (all roles)
- Approval history from `approvals` array

### Modals
1. **Add Activity:** date picker, title, description
2. **Reject Activity:** required comment textarea

### Dashboard links
Update View buttons → `navigate('/proposals/' + id)`

---

## Axios helpers

```js
// src/api/activities.js
getProposalActivities(proposalId)
createActivity(proposalId, { activity_date, title, description })
pokeForUpdate(proposalId)
approveActivity(activityId, comment?)
rejectActivity(activityId, comment)
addActivityComment(activityId, comment)
```

---

## Test scenario

1. Login `partya@test.com` → submit proposal (Energy & Power)
2. Login `sectorlead@test.com` → open `/proposals/:id`
3. Click **Poke for Update** → activity appears
4. Login `partya@test.com` → add activity with past date
5. Login `sectorlead@test.com` → approve activity
6. Login `superadmin@test.com` → see all + comment on any activity

---

## Step 4 (next — not built)

- Regional Focal Point role + dashboard
- Party B login + response to activities
- Email notifications on poke / approval
- Activity attachments (files)
- Admin analytics dashboard

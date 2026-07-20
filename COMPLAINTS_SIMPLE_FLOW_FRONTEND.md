# Complaints — Professional Flow (Party A/B → Sector Lead → Super Admin)

**Auth:** `Authorization: Bearer <token>`  
**Base:** `/api/complaints`

Regional FP forward is **disabled**. Use Resolve / Reject / Comment / Escalate / Reopen only.

**DB (once per environment):** `npm run db:migrate:complaint-professional`  
**SLA:** default **7 days** (`COMPLAINT_SLA_DAYS` env). Response includes `due_at`, `is_overdue`, `sla_days`.

---

## Flow

```
Party A/B files complaint on MOU
        ↓
Auto-tag Sector Lead for MOU sector  (status: open, due_at = now + SLA)
  → if no SL: tagged to Super Admin + awaiting_sector_lead=1
        ↓
SL/SA first comment → status under_review
SL/SA → Resolve (comment required) / Reject (comment required)
Party/SL/SA → Escalate → status escalated (SA notified)
Party/SA → Reopen rejected → status open (new due_at)
        ↓
Super Admin: GET /all + filters + GET /stats
```

| Status | Meaning |
|--------|---------|
| `open` | New / awaiting first reviewer action |
| `under_review` | SL/SA has commented |
| `escalated` | Raised to Super Admin |
| `resolved` | Closed — accepted (`resolution_comment`) |
| `rejected` | Closed — rejected (can **reopen**) |

Emails fire when `EMAIL_ENABLED=true` (filed / status / comment / escalated).

---

## Shared response fields

| Field | Use |
|-------|-----|
| `filed_by_role` | `party_a` / `party_b` badge |
| `proposal_title` | MOU title (do **not** hardcode "Untitled") |
| `proposal_company_name` | Party A company |
| `priority` | `low` \| `normal` \| `high` |
| `category` | `delay` \| `documentation` \| `communication` \| `misconduct` \| `other` |
| `due_at` | SLA deadline |
| `is_overdue` | boolean |
| `awaiting_sector_lead` | `1` if no real SL (SA fallback) |
| `outcome` | `{ status, comment }` when resolved/rejected, else `null` |
| `actions` | Timeline (approved / rejected / escalated / reopened / under_review) |
| `capabilities` | Button gates |

```json
"capabilities": {
  "can_approve": true,
  "can_reject": true,
  "can_comment": true,
  "can_escalate": true,
  "can_reopen": false,
  "can_forward": false
}
```

**UI:** hide Forward button & Forwarded To column. Use `capabilities.*` for Resolve / Reject / Escalate / Reopen.

---

## 1. File complaint — Party A / B

```
POST /api/complaints
```

| Field | Required | Notes |
|-------|----------|--------|
| `proposal_id` | ✅ | Their MOU |
| `title` | ✅ | Duplicate open title on same MOU → **409** |
| `description` | ✅ | |
| `priority` | ❌ | `low` / `normal` (default) / `high` |
| `category` | ❌ | see list above |
| `tagged_sector_lead` | ❌ | else auto from sector |
| `document` | ❌ | multipart |

**201** — full complaint + capabilities  
**409** — `{ error, existing_complaint_id }`

---

## 2. Lists

| Role | Endpoint |
|------|----------|
| Party A/B | `GET /api/complaints/my` |
| Sector Lead | `GET /api/complaints/sector` |
| Super Admin | `GET /api/complaints/all` (below) |

---

## 3. Sector Lead / Super Admin actions

### Resolve (comment **required**)

```
PATCH /api/complaints/:id/approve
{ "comment": "Issue addressed — closing." }
```

### Reject (comment **required**)

```
PATCH /api/complaints/:id/reject
{ "comment": "Not valid — please provide evidence." }
```

### Comment → auto `under_review` (from `open`)

```
POST /api/complaints/:id/comments
{ "comment": "Please share more details." }
```

Response includes `complaint_status` + `capabilities`.

### Escalate

```
POST /api/complaints/:id/escalate
{ "comment": "No response for 5 days" }   // optional
```

**Who:** filer, tagged SL, or SA — only if status is `open` or `under_review`.

### Reopen (after reject only)

```
POST /api/complaints/:id/reopen
{ "comment": "Providing additional evidence" }   // required
```

**Who:** filer or SA → status back to `open`, new `due_at`.

---

## 4. Detail

```
GET /api/complaints/:id
```

Show `outcome.comment` on closed tickets. Render `actions` as audit timeline.

---

## 5. Super Admin — filters + stats

### Filter options

```
GET /api/complaints/filter-options
```

Returns `statuses` (incl. `escalated`), `priorities`, `categories`, `sector_leads`, `parties`, `sectors`.

### Stats dashboard cards

```
GET /api/complaints/stats
```

```json
{
  "total": 40,
  "open": 8,
  "under_review": 5,
  "escalated": 2,
  "resolved": 20,
  "rejected": 5,
  "awaiting_sector_lead": 1,
  "overdue": 3,
  "sla_days": 7
}
```

### List

```
GET /api/complaints/all
```

| Param | Example |
|-------|---------|
| `status` | `escalated` |
| `sector_lead_id` | `3` |
| `filed_by` | `10` |
| `sector` | `Seed Sales` |
| `priority` | `high` |
| `category` | `delay` |
| `awaiting_sector_lead` | `1` |
| `escalated` | `1` |
| `overdue` | `1` |
| `q` / `company` | search |

Each row includes `is_overdue`, `outcome`, `capabilities`.

---

## 6. UI checklist

### All roles
- [ ] Use `proposal_title` (not "Untitled")
- [ ] Show Party A/B via `filed_by_role`
- [ ] Hide Forward / Forwarded To
- [ ] Show `is_overdue` badge when true
- [ ] Resolve/Reject require comment input
- [ ] Show Escalate when `can_escalate`; Reopen when `can_reopen`
- [ ] Timeline from `actions` + public `comments`

### Super Admin
- [ ] Cards from `GET /stats`
- [ ] Filters from `filter-options` + overdue / escalated / awaiting SL / priority

---

## Related (disabled)

- Forward / return Regional FP — **403**, `can_forward: false`

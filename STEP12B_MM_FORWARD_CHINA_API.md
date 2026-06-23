# Step 12B — Matchmaking: Forward Shortlisted Proposal to China RFP

**Backend:** `http://localhost:5000`  
**Base path:** `/api/matchmaking`  
**Auth:** `Authorization: Bearer <token>`

> **Prerequisite:** Step 12A done — proposal status must be `shortlisted`.

---

## Migration (run once)

```bash
npm run db:migrate:matchmaking-forward-china
```

---

## Status flow (this step)

```
shortlisted → forwarded_to_china
```

| Status | Meaning |
|--------|---------|
| `shortlisted` | Ready to forward to China RFP |
| `forwarded_to_china` | Sent to China Regional Focal Point |

---

## Test credentials

| Role | Email | Password |
|------|-------|----------|
| Sector Lead | `sectorlead@test.com` | `password123` |
| China RFP | `rfp@test.com` | `password123` |
| Super Admin | `superadmin@test.com` | `password123` |

---

## APIs

### 1. List shortlisted (forward queue)

```
GET /api/matchmaking/pakistan/sector-lead?status=shortlisted
```

**Role:** `sector_lead` or `super_admin`

---

### 2. Get China RFP users (dropdown)

```
GET /api/users/regional-focal-points
```

**Role:** `sector_lead` or `super_admin` (existing users API)

**Response:**

```json
[
  {
    "id": 5,
    "full_name": "Regional Focal Point — Punjab",
    "email": "rfp@test.com",
    "sector": "Punjab Region"
  }
]
```

Use `id` as `regional_focal_point_id` when forwarding.

---

### 3. Forward to China RFP

```
PATCH /api/matchmaking/pakistan/:id/forward-china
```

**Role:** `sector_lead` or `super_admin`  
**Only when status = `shortlisted`**

**Body:**

```json
{
  "regional_focal_point_id": 5
}
```

**Response:**

```json
{
  "message": "Proposal forwarded to Regional Focal Point — Punjab (China Regional FOP)",
  "proposal": {
    "id": 2,
    "status": "forwarded_to_china",
    "forwarded_to_rfp": 5,
    "forwarded_to_rfp_name": "Regional Focal Point — Punjab",
    "forwarded_to_rfp_email": "rfp@test.com",
    "forwarded_at": "2026-06-08T14:00:00.000Z"
  }
}
```

---

### 4. List forwarded (tracking)

```
GET /api/matchmaking/pakistan/sector-lead?status=forwarded_to_china
```

---

## Frontend UI

### Shortlisted tab — add action

When `status === 'shortlisted'`:

1. Load RFP dropdown → `GET /api/users/regional-focal-points`
2. User selects China RFP
3. Confirm → `PATCH /api/matchmaking/pakistan/:id/forward-china`

### New tab (optional)

**Forwarded to China** → `?status=forwarded_to_china`

Show: `forwarded_to_rfp_name`, `forwarded_at`

---

## Errors

| Code | Message |
|------|---------|
| 400 | `regional_focal_point_id is required` |
| 400 | Only shortlisted proposals can be forwarded |
| 400 | Invalid RFP user id |
| 403 | Wrong sector |
| 404 | Proposal not found |

---

## Postman quick test

```
# 1. Login sector lead
POST /api/auth/login
{ "email": "sectorlead@test.com", "password": "password123" }

# 2. Shortlisted list
GET /api/matchmaking/pakistan/sector-lead?status=shortlisted

# 3. RFP list
GET /api/users/regional-focal-points

# 4. Forward
PATCH /api/matchmaking/pakistan/2/forward-china
{ "regional_focal_point_id": 5 }
```

**Next step (12C):** China RFP views forwarded Pakistan proposals.

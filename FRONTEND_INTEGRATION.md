# Investment Portal — Frontend Integration Guide

Backend: **Node.js + Express + MySQL + JWT** @ `http://localhost:5000`  
Frontend: **React (Vite) + Tailwind** @ `http://localhost:5173`

---

## Environment

### Backend `.env`
```env
PORT=5000
DATABASE_URL=mysql://root:yourpassword@localhost:3306/pk_china_portal
JWT_SECRET=your-secret-min-32-chars
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=http://localhost:5173
API_HOST=http://localhost:5000
```

### Frontend `.env`
```env
VITE_API_URL=http://localhost:5000
```

---

## Setup

```bash
# Backend
cd investment-portal-backend
npm install
npm run db:init
npm run db:seed
npm run dev

# Frontend
cd investment-portal-frontend
npm install
npm run dev
```

**Test login:** `partya@test.com` / `password123`

---

## Auth

All protected routes need:
```
Authorization: Bearer <token>
```

### POST `/api/auth/register`
Party A only — role is hardcoded server-side as `party_a`.

**Body:**
```json
{
  "full_name": "string",
  "email": "string",
  "password": "string (min 6)",
  "organization": "string",
  "phone": "string"
}
```

**Response 201:**
```json
{
  "token": "jwt...",
  "user": { "id", "full_name", "email", "role", "organization", "phone" },
  "redirect": "/dashboard/party-a"
}
```

### POST `/api/auth/login`

**Body:** `{ "email", "password" }`

**Response 200:** same as register

---

## Proposals (Party A only)

### POST `/api/proposals/draft`
Partial save — send only fields you have.

**Body:**
```json
{
  "proposal_id": 1,
  "sector": "Energy & Power",
  "proposal_title": "...",
  "proposal_description": "...",
  "proposal_file_url": "http://localhost:5000/uploads/...",
  "party_b_name": "...",
  "party_b_organization": "...",
  "party_b_email": "...",
  "party_b_phone": "...",
  "party_b_country": "...",
  "mou_scope": "...",
  "mou_description": "...",
  "mou_sector": "...",
  "mou_demand": "...",
  "mou_file_url": "http://localhost:5000/uploads/..."
}
```

- Omit `proposal_id` on first save → INSERT
- Include `proposal_id` on later saves → UPDATE

**Response:**
```json
{ "proposal_id": 1, "status": "draft" }
```

### POST `/api/proposals/submit`

**Body:** `{ "proposal_id": 1 }`

Validates all 14 required fields. On failure:

```json
{
  "error": "Missing required fields",
  "missing_fields": ["Proposal Title", "MOU File"]
}
```

**Response 200:**
```json
{ "proposal_id": 1, "status": "submitted" }
```

### POST `/api/proposals/upload`
`multipart/form-data` — field name **`proposal_file`** OR **`mou_file`**

- Allowed: PDF, DOC, DOCX
- Max: 10MB

**Response:**
```json
{ "file_url": "http://localhost:5000/uploads/1234-file.pdf" }
```

### GET `/api/proposals/my`

**Response:** array of proposal objects for logged-in Party A user.

---

## Frontend Routes

| Route | Page |
|-------|------|
| `/auth/register` | Party A registration |
| `/auth/login` | Login |
| `/dashboard/party-a` | My opportunities table |
| `/proposals/new` | 3-step form |

---

## localStorage Keys

| Key | Purpose |
|-----|---------|
| `auth_token` | JWT |
| `auth_user` | User JSON |
| `proposal_draft_id` | Current draft ID |
| `proposal_draft_step` | Step 1–3 |
| `proposal_form_data` | Form fields JSON |

---

## 10 Sectors

Energy & Power · Agriculture & Food · Information Technology · Textile & Garments · Mining & Minerals · Infrastructure & Construction · Healthcare & Pharma · Education & Training · Finance & Banking · Tourism & Hospitality

---

## Error Format

```json
{ "error": "message" }
```

HTTP 401 → clear auth, redirect to login.

---

## Step 2 (Next — not built yet)

- Sector Lead / Regional Focal Point / Admin dashboards
- Proposal review & approval workflow
- Party B login
- Matching algorithm
- Engagement rooms / chat

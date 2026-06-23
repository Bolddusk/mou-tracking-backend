# Step 17 — Per-Party MOU Acknowledgment (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Party A and Party B each acknowledge the MOU **once**. When **both** have acknowledged → `mou_status` auto-updates to `signed`.

Applies to:
- **Direct MOUS** → `proposals` table
- **Matchmaking engagement** → `mm_matches` table (MOU file still on linked `proposals` engagement row)

---

## Setup (once)

```bash
cd investment-portal-backend
npm run db:migrate:mou-acknowledgment
npm run dev
```

Adds to `proposals` and `mm_matches`:
- `mou_ack_by_a`, `mou_ack_by_a_at`
- `mou_ack_by_b`, `mou_ack_by_b_at`

---

## Rules

| Rule | Detail |
|------|--------|
| Who can acknowledge | **Only** `party_a` or `party_b` |
| Who cannot | `sector_lead`, `super_admin` — cannot ack on behalf of parties |
| Prerequisite | `mou_file_url` must exist |
| Once only | Second ack → `400 Already acknowledged` |
| Signed status | Auto `mou_status = signed` when **both** `party_a_acknowledged` and `party_b_acknowledged` are true |
| Manual override | Existing `PATCH .../mou` with `mou_status` still works (admin upload flow unchanged) |

---

## Direct MOUS APIs

### GET acknowledgment status

```
GET /api/proposals/:id/mou/status
```

**Roles:** `party_a`, `party_b`, `sector_lead`, `super_admin`

**Response `200`:**

```json
{
  "proposal_id": 39,
  "mou_status": "uploaded",
  "mou_file_url": "http://localhost:5000/uploads/mou.pdf",
  "mou_uploaded_by": 2,
  "mou_uploaded_at": "2026-06-10T10:00:00.000Z",
  "party_a_acknowledged": false,
  "party_a_ack_at": null,
  "party_b_acknowledged": false,
  "party_b_ack_at": null
}
```

### Acknowledge (Party A or Party B)

```
PATCH /api/proposals/:id/mou/acknowledge
Authorization: Bearer <token>
```

**Roles:** `party_a`, `party_b` only  
**Body:** empty (no JSON required)

**Response `200`:**

```json
{
  "message": "MOU acknowledged successfully",
  "proposal_id": 39,
  "mou_status": "signed",
  "mou_file_url": "http://localhost:5000/uploads/mou.pdf",
  "mou_uploaded_by": 2,
  "mou_uploaded_at": "2026-06-10T10:00:00.000Z",
  "party_a_acknowledged": true,
  "party_a_ack_at": "2026-06-10T11:00:00.000Z",
  "party_b_acknowledged": true,
  "party_b_ack_at": "2026-06-10T11:30:00.000Z"
}
```

---

## Matchmaking APIs

### GET status

```
GET /api/matchmaking/matches/:id/mou/status
```

**Roles:** `party_a`, `party_b`, `sector_lead`, `super_admin`

**Response `200`:**

```json
{
  "match_id": 5,
  "engagement_proposal_id": 42,
  "mou_status": "uploaded",
  "mou_file_url": "http://localhost:5000/uploads/mou.pdf",
  "mou_uploaded_by": 2,
  "mou_uploaded_at": "2026-06-10T10:00:00.000Z",
  "party_a_acknowledged": true,
  "party_a_ack_at": "2026-06-10T11:00:00.000Z",
  "party_b_acknowledged": false,
  "party_b_ack_at": null
}
```

### Acknowledge

```
PATCH /api/matchmaking/matches/:id/mou/acknowledge
```

Same rules and response shape as direct MOUS (includes `match_id`, `engagement_proposal_id`).

**Tip:** If you only have `engagement_proposal_id`, resolve match first:

```
GET /api/matchmaking/engagement/:engagementProposalId/match
→ use match.id for MOU status/ack APIs
```

---

## Errors

| Status | Error |
|--------|-------|
| `400` | `MOU file not uploaded yet` |
| `400` | `Already acknowledged` |
| `400` | `MOU acknowledgment is only available after approval` |
| `403` | Wrong party / role cannot acknowledge |
| `403` | `Only Party A or Party B can acknowledge the MOU` |

---

## UI — MOU tab (Direct + Matchmaking)

### Load on tab open

```
Direct:      GET /api/proposals/:id/mou/status
Matchmaking: GET /api/matchmaking/matches/:matchId/mou/status
```

### Layout

```
┌─────────────────────────────────────────────┐
│ MOU Document                    [View PDF]  │
├─────────────────────────────────────────────┤
│ Party A (Pakistan)     ○ Pending / ✓ Signed │
│   Acknowledged: 10 Jun 2026 11:00           │
│   [I Acknowledge MOU]  ← party_a only       │
├─────────────────────────────────────────────┤
│ Party B (China)        ○ Pending / ✓ Signed │
│   [I Acknowledge MOU]  ← party_b only       │
├─────────────────────────────────────────────┤
│ Overall status: uploaded → signed           │
│ Progress: ████████░░ 1/2 parties          │
└─────────────────────────────────────────────┘
```

### Button logic

| User | Show ack button when |
|------|----------------------|
| `party_a` | `!party_a_acknowledged` && `mou_file_url` exists |
| `party_b` | `!party_b_acknowledged` && `mou_file_url` exists |
| `sector_lead` / `super_admin` | **Never** — read-only status view |
| Anyone | Hide ack if already acknowledged for their side |

### On acknowledge click

```
PATCH .../mou/acknowledge
→ refresh GET .../mou/status
→ if mou_status === 'signed' show success toast + badge
```

### Status badges

| `mou_status` | Badge |
|--------------|-------|
| `not_started` | Grey |
| `in_progress` | Yellow |
| `uploaded` | Blue |
| `signed` | Green (both parties ack'd OR manual admin set) |

---

## Test flow (Postman)

1. Approved proposal with `mou_file_url` set  
2. Login Party A → `PATCH /api/proposals/39/mou/acknowledge`  
3. `GET /api/proposals/39/mou/status` → `party_a_acknowledged: true`, status still `uploaded`  
4. Login Party B → `PATCH /api/proposals/39/mou/acknowledge`  
5. Status → `mou_status: signed`, both ack true  

---

## Frontend prompt (copy into Cursor)

```
Add per-party MOU acknowledgment to MOU tab (Direct MOUS + Matchmaking).

Follow STEP17_MOU_ACKNOWLEDGMENT_API.md

Direct MOUS engagement:
- GET /api/proposals/:proposalId/mou/status on MOU tab load
- PATCH /api/proposals/:proposalId/mou/acknowledge when Party A or B clicks "I Acknowledge MOU"

Matchmaking engagement:
- Resolve match: GET /api/matchmaking/engagement/:engagementProposalId/match
- GET /api/matchmaking/matches/:matchId/mou/status
- PATCH /api/matchmaking/matches/:matchId/mou/acknowledge

UI:
- Two rows: Party A acknowledgment + Party B acknowledgment (checkmark + timestamp)
- Show ack button ONLY for logged-in party if their side not yet acknowledged
- sector_lead and super_admin: read-only status, no ack button
- Disable/hide ack if mou_file_url is null — show "Upload MOU first"
- After both acknowledge, mou_status becomes signed — show green "Fully Signed" badge
- Progress indicator: 0/2, 1/2, 2/2 parties acknowledged
- Handle 400 Already acknowledged — hide button, show checkmark
- Keep existing MOU upload form (PATCH .../mou) unchanged

Do not change chat or activities tabs.
```

---

## Related docs

- `STEP15_PROPOSAL_MOU_API.md` — MOU upload/view (unchanged)
- `STEP12H_MM_MOU_API.md` — Matchmaking MOU upload (unchanged)

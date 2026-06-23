# Step 20 — Close Deal After MOU Signed (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

After both parties acknowledge the MOU (`mou_status = 'signed'`), Sector Lead or Super Admin can **close the deal** — the final step in the lifecycle.

Applies to:
- **Direct MOUS** → `proposals.status = 'completed'`, `proposals.mou_status = 'deal_closed'`
- **Matchmaking** → `mm_matches.mou_status = 'deal_closed'`

---

## Setup (once)

```bash
cd investment-portal-backend
npm run db:migrate:deal-closed
npm run dev
```

**New DB values:**
- `proposals.status`: adds `completed`
- `proposals.mou_status` / `mm_matches.mou_status`: adds `deal_closed`
- `deal_closed_at`, `deal_closed_by` on both tables (audit trail)

---

## Lifecycle flow

```
draft → submitted → approved → MOU uploaded → both ack → signed → close deal → completed / deal_closed
```

| Stage | proposals.status | mou_status | Who acts |
|-------|------------------|------------|----------|
| After SL approval | `approved` | `uploaded` / `in_progress` | Parties upload/ack MOU |
| Both parties ack | `approved` | `signed` | — |
| SL/SA closes deal | `completed` | `deal_closed` | Sector Lead / Super Admin |
| After close | locked | `deal_closed` | Read-only for all |

---

## Rules

| Rule | Detail |
|------|--------|
| Who can close | `sector_lead`, `super_admin` only |
| Sector lead scope | Must match proposal/match sector |
| Prerequisite | `mou_status` must be `signed` |
| Party A / B | Cannot close deal |
| After close | No MOU upload, ack, activities, or chat sends |
| View access | MOU + history still viewable when `completed` |
| Audit | `deal_closed_at`, `deal_closed_by`, `deal_closed_by_name` stored |

---

## Direct MOUS — Close deal

```
PATCH /api/proposals/:id/close-deal
Authorization: Bearer <token>
```

**Roles:** `sector_lead`, `super_admin`  
**Body:** empty (no JSON required)

**Success `200`:**

```json
{
  "message": "Deal closed successfully",
  "proposal": {
    "id": 39,
    "status": "completed",
    "mou_status": "deal_closed",
    "deal_closed_at": "2026-06-04T15:30:00.000Z",
    "deal_closed_by": 5,
    "deal_closed_by_name": "Hasnain Lodhi",
    "venture_name": "...",
    "mou_file_url": "..."
  },
  "capabilities": {
    "can_view_mou": true,
    "can_upload_mou": false,
    "can_add_activity": false,
    "can_send_chat": false,
    "can_close_deal": false
  }
}
```

**Errors:**

| Status | When |
|--------|------|
| `400` | `MOU must be signed by both parties before closing deal` |
| `400` | `Deal is already closed` |
| `403` | Wrong sector (sector_lead) or wrong role |
| `404` | Proposal not found |

---

## Matchmaking — Close deal

```
PATCH /api/matchmaking/matches/:id/close-deal
Authorization: Bearer <token>
```

**Roles:** `sector_lead`, `super_admin`  
**Body:** empty

**Success `200`:**

```json
{
  "message": "Deal closed successfully",
  "match": {
    "id": 12,
    "mou_status": "deal_closed",
    "deal_closed_at": "2026-06-04T15:30:00.000Z",
    "deal_closed_by": 5,
    "deal_closed_by_name": "Hasnain Lodhi",
    "engagement_proposal_id": 55,
    "sector": "Agri-chemicals & Inputs"
  },
  "can_close_deal": false
}
```

Same `400` / `403` rules as proposals.

---

## Capabilities flag (Direct MOUS)

`GET /api/proposals/:id` returns `capabilities.can_close_deal`:

```ts
capabilities.can_close_deal === true
// → show "Close Deal" button (SL/SA only, mou_status === 'signed')
```

After close, all edit capabilities are `false`; `can_view_mou` stays `true`.

---

## MOU status response (updated fields)

`GET .../mou/status` now includes deal-close audit when closed:

```json
{
  "mou_status": "deal_closed",
  "party_a_acknowledged": true,
  "party_b_acknowledged": true,
  "deal_closed_at": "2026-06-04T15:30:00.000Z",
  "deal_closed_by": 5,
  "deal_closed_by_name": "Hasnain Lodhi",
  "versions": [ ]
}
```

---

## Frontend UX recommendations

### 1. Close Deal button

Show when:
- User role is `sector_lead` or `super_admin`
- `mou_status === 'signed'`
- Direct: `capabilities.can_close_deal === true`
- Match: same check on match detail (`mou_status === 'signed'`, correct sector)

```tsx
<Button
  variant="primary"
  onClick={handleCloseDeal}
  disabled={mouStatus !== 'signed'}
>
  Close Deal
</Button>
```

Confirm dialog:
> "Both parties have signed the MOU. Close this deal? No further edits will be allowed."

### 2. After close — UI state

| Element | Behavior |
|---------|----------|
| Status badge | `Completed` / `Deal Closed` (green or neutral) |
| MOU upload | Hidden / disabled |
| Acknowledge buttons | Hidden |
| Activities | Read-only list |
| Chat | Read-only (no send) |
| Version history | Still visible (download only) |
| Close Deal button | Hidden |

### 3. Status badges

```ts
function mouStatusLabel(status: string, proposalStatus?: string) {
  if (status === 'deal_closed' || proposalStatus === 'completed') return 'Deal Closed';
  if (status === 'signed') return 'MOU Signed';
  if (status === 'uploaded') return 'MOU Uploaded';
  // ...
}
```

### 4. List filters

Sector Lead proposal list can filter `status=completed` for closed deals.

---

## TypeScript types (suggested)

```ts
export interface DealCloseResponse {
  message: string;
  proposal?: Proposal & {
    status: 'completed';
    mou_status: 'deal_closed';
    deal_closed_at: string;
    deal_closed_by: number;
    deal_closed_by_name: string;
  };
  capabilities?: ProposalCapabilities;
  match?: Match & {
    mou_status: 'deal_closed';
    deal_closed_at: string;
    deal_closed_by: number;
    deal_closed_by_name: string;
  };
  can_close_deal?: boolean;
}

export interface ProposalCapabilities {
  can_view_mou: boolean;
  can_upload_mou: boolean;
  can_add_activity: boolean;
  can_send_chat: boolean;
  can_close_deal: boolean;
}
```

---

## API service helpers (suggested)

```ts
export const closeProposalDeal = (id: number) =>
  api.patch<DealCloseResponse>(`/proposals/${id}/close-deal`);

export const closeMatchDeal = (matchId: number) =>
  api.patch<DealCloseResponse>(`/matchmaking/matches/${matchId}/close-deal`);
```

---

## Test flow (manual)

1. `npm run db:migrate:deal-closed`
2. Approved proposal with MOU signed by both parties
3. Login as `sectorlead@test.com` → `PATCH /api/proposals/:id/close-deal` → `200`
4. Verify `status: completed`, `mou_status: deal_closed`
5. Try `PATCH .../mou` upload → `400 This deal is closed — no further edits allowed`
6. Repeat for matchmaking match

---

## Frontend implementation prompt

Copy into your frontend Cursor chat:

```
Implement "Close Deal" flow after MOU is signed.

Backend docs: STEP20_DEAL_CLOSE_API.md (backend repo)

## New endpoints
- PATCH /api/proposals/:id/close-deal (sector_lead, super_admin)
- PATCH /api/matchmaking/matches/:id/close-deal (sector_lead, super_admin)

## Prerequisites
- mou_status must be 'signed' (both parties acknowledged)
- Only sector_lead (same sector) or super_admin

## UI tasks
1. Add "Close Deal" button on proposal detail + match detail MOU section
   - Show when capabilities.can_close_deal === true (proposals) or mou_status === 'signed' for SL/SA on matches
   - Confirmation modal before API call
2. On success: refresh detail, show "Deal Closed" badge, hide upload/ack/activity/chat actions
3. Handle errors:
   - 400 "MOU must be signed by both parties before closing deal"
   - 400 "Deal is already closed"
4. Status display:
   - proposals.status === 'completed' → "Completed"
   - mou_status === 'deal_closed' → "Deal Closed"
   - Show deal_closed_at and deal_closed_by_name in summary panel
5. Lock UI when deal closed — respect capabilities from GET /api/proposals/:id (all edit caps false, can_view_mou true)
6. Add completed filter/tab on Sector Lead proposal list (optional)

## Flow position
MOU signed (both ack) → Close Deal → completed/deal_closed (terminal state)

Match existing styling and API patterns. Direct MOUS and Matchmaking share one CloseDealButton component.
```

# Step 21 — Reject → Resubmit Flow (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

When Sector Lead **rejects** a Direct MOUS proposal, Party A can **edit** it and **resubmit** for review. Resubmitted proposals appear in the SL queue like new submissions.

Applies to: **Direct MOUS** (`proposals` table only — not matchmaking Pakistan flow).

---

## Setup (once)

```bash
cd investment-portal-backend
npm run db:migrate:proposal-resubmit
npm run dev
```

**DB changes:**
- `proposals.status` adds `resubmitted`
- `resubmit_count INT DEFAULT 0` — audit trail
- `last_resubmitted_at TIMESTAMP NULL`

---

## Lifecycle flow

```
draft → submitted → approved → … (happy path)

draft → submitted → rejected → [Party A edits] → resubmitted → approved / rejected
```

| Stage | status | Who acts |
|-------|--------|----------|
| SL rejects | `rejected` | Sector Lead |
| Party A fixes form | `rejected` (unchanged) | Party A saves draft |
| Party A resubmits | `resubmitted` | Party A calls `/resubmit` |
| SL reviews again | `approved` / `rejected` | Sector Lead |

---

## Rules

| Rule | Detail |
|------|--------|
| Who can edit rejected | Party A (`party_a`) via `POST /draft` |
| Who can resubmit | Party A only — not Super Admin |
| Resubmit trigger | Explicit `PATCH /resubmit` — **not** auto on save |
| Validation | Same required fields as `POST /submit` |
| Submit unchanged | `POST /submit` still **draft-only** |
| SL queue (default) | `submitted` + `resubmitted` proposals |
| SL approve/reject | Works on both `submitted` and `resubmitted` |
| Audit | `resubmit_count`, `last_resubmitted_at` on proposal |
| Delete | Party A can still delete `draft` or `rejected` proposals |

---

## Updated — Save draft (rejected editable)

```
POST /api/proposals/draft
Authorization: Bearer <token>
```

**Roles:** `party_a`, `super_admin`

Party A can now save when `status` is `draft` **or** `rejected`.

**Response `200` (editing rejected proposal):**

```json
{
  "proposal_id": 39,
  "status": "rejected"
}
```

Status stays `rejected` until `/resubmit` is called.

**Error `400`:** `Only draft proposals can be edited` — if status is `submitted`, `approved`, etc.

---

## New — Resubmit proposal

```
PATCH /api/proposals/:id/resubmit
Authorization: Bearer <token>
```

**Roles:** `party_a` only  
**Body:** empty (no JSON required)

**Prerequisites:**
- `proposal.party_a_id === current user`
- `proposal.status === 'rejected'`
- All required fields filled (same as submit)

**Success `200`:**

```json
{
  "message": "Proposal resubmitted for sector lead review",
  "proposal": {
    "id": 39,
    "status": "resubmitted",
    "resubmit_count": 1,
    "last_resubmitted_at": "2026-06-04T10:30:00.000Z",
    "submitted_at": "2026-06-04T10:30:00.000Z",
    "sector_lead_comment": "Please add financial projections",
    "venture_name": "...",
    "company_name": "..."
  }
}
```

**Errors:**

| Status | Response |
|--------|----------|
| `400` | `{ "error": "Only rejected proposals can be resubmitted" }` |
| `400` | `{ "error": "Missing fields", "fields": ["MOU File", "Party B Email", ...] }` |
| `403` | `{ "error": "Access denied" }` |
| `404` | `{ "error": "Proposal not found" }` |

> **Note:** Resubmit uses `fields` array. Initial submit uses `missing_fields` — handle both in UI validation display.

---

## Submit (unchanged — draft only)

```
POST /api/proposals/submit
Body: { "proposal_id": 39 }
```

Still requires `status === 'draft'`. Rejected proposals **must** use `PATCH /resubmit`.

---

## Sector Lead queue (updated)

```
GET /api/proposals/sector-lead
Authorization: Bearer <token>
```

**Default (no filter):** returns `submitted` + `resubmitted` only (pending review queue).

**With filter:** `?status=approved` | `rejected` | `resubmitted` | `submitted` | `completed`

Sorted by `last_resubmitted_at` (or `submitted_at`) descending — resubmits appear at top.

**Resubmitted badge hint:** show when `status === 'resubmitted'` or `resubmit_count > 0`.

```tsx
{proposal.status === 'resubmitted' && (
  <Badge color="amber">Resubmitted {proposal.resubmit_count > 1 ? `(×${proposal.resubmit_count})` : ''}</Badge>
)}
```

**SL approve/reject:** unchanged endpoints — now accept `resubmitted` status:

```
PATCH /api/proposals/:id/approve
PATCH /api/proposals/:id/reject
```

---

## Party A — My proposals

```
GET /api/proposals/my
```

Rejected proposals include `sector_lead_comment` — show rejection reason prominently.

When `status === 'rejected'`:
- Enable edit form (same as draft wizard)
- Show **Resubmit** button (not Submit)
- Show SL rejection comment at top

---

## Frontend UX recommendations

### 1. Rejected proposal screen

```
┌─────────────────────────────────────────────┐
│ ⚠ Rejected by Sector Lead                   │
│ "Please add financial projections"          │
│ (sector_lead_comment)                       │
├─────────────────────────────────────────────┤
│ [Edit form — same as create wizard]         │
│                                             │
│ [Save Draft]          [Resubmit for Review] │
└─────────────────────────────────────────────┘
```

- **Save Draft** → `POST /draft` (status stays `rejected`)
- **Resubmit** → validate client-side first, then `PATCH /:id/resubmit`
- On missing fields → show `fields[]` from API response

### 2. Resubmit confirmation

> "Send updated proposal to Sector Lead for review?"

On success → toast + redirect to My Proposals with `resubmitted` status.

### 3. Sector Lead list

| Column | Resubmitted row |
|--------|-----------------|
| Status | `Resubmitted` badge (distinct from `Submitted`) |
| Sort | Already newest-first from API |
| Detail | Show `resubmit_count`, `last_resubmitted_at` |

### 4. Status labels

```ts
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  resubmitted: 'Resubmitted',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
};
```

### 5. Button visibility

```ts
const canEdit = ['draft', 'rejected'].includes(proposal.status);
const canSubmit = proposal.status === 'draft';
const canResubmit = proposal.status === 'rejected';
```

---

## TypeScript types (suggested)

```ts
export type ProposalStatus =
  | 'draft'
  | 'submitted'
  | 'resubmitted'
  | 'approved'
  | 'rejected'
  | 'completed';

export interface Proposal {
  id: number;
  status: ProposalStatus;
  resubmit_count: number;
  last_resubmitted_at: string | null;
  sector_lead_comment: string | null;
  submitted_at: string | null;
  // ...existing fields
}

export interface ResubmitResponse {
  message: string;
  proposal: Proposal;
}

export interface ResubmitValidationError {
  error: 'Missing fields';
  fields: string[];
}
```

---

## API service helpers (suggested)

```ts
export const saveProposalDraft = (body: Record<string, unknown>) =>
  api.post<{ proposal_id: number; status: string }>('/proposals/draft', body);

export const submitProposal = (proposalId: number) =>
  api.post('/proposals/submit', { proposal_id: proposalId });

export const resubmitProposal = (id: number) =>
  api.patch<ResubmitResponse>(`/proposals/${id}/resubmit`);

export const getSectorLeadProposals = (status?: ProposalStatus) =>
  api.get<Proposal[]>('/proposals/sector-lead', {
    params: status ? { status } : undefined,
  });
```

---

## Test flow (manual)

1. `npm run db:migrate:proposal-resubmit`
2. Party A submits proposal → SL rejects with comment
3. Party A opens rejected proposal → edits fields → `POST /draft` → status still `rejected`
4. Party A clicks Resubmit → `PATCH /proposals/:id/resubmit` → `status: resubmitted`
5. SL queue shows proposal with resubmitted badge
6. SL approves → `status: approved`

**Test user:** `partya@test.com` / `password123`, `sectorlead@test.com` / `password123`

---

## Frontend implementation prompt

Copy the block below into your frontend Cursor chat:

```
Implement Party A reject → resubmit flow for Direct MOUS proposals.

Backend docs: STEP21_PROPOSAL_RESUBMIT_API.md (backend repo)

## What changed
- Rejected proposals can be edited via POST /api/proposals/draft (status stays rejected until resubmit)
- New: PATCH /api/proposals/:id/resubmit (party_a only)
- SL queue GET /api/proposals/sector-lead now returns submitted + resubmitted by default
- SL approve/reject works on resubmitted status
- New fields: resubmit_count, last_resubmitted_at

## Tasks — Party A
1. On proposal detail / edit when status === 'rejected':
   - Show sector_lead_comment in a rejection banner
   - Keep form editable (same wizard as draft)
   - Replace "Submit" with "Resubmit for Review" button
   - Save Draft still calls POST /draft (does NOT change status)
2. Resubmit button:
   - Client-side validate required fields (reuse submit validation if exists)
   - PATCH /api/proposals/:id/resubmit
   - On 400 Missing fields: show fields[] list
   - On success: toast + navigate to my proposals
3. My Proposals list: show Rejected / Resubmitted status badges

## Tasks — Sector Lead
4. SL proposal list: show "Resubmitted" badge when status === 'resubmitted'
5. Optional: show resubmit_count and last_resubmitted_at on detail
6. Approve/reject flows unchanged — no API changes needed on SL side

## Do NOT
- Use POST /submit for rejected proposals (draft only)
- Auto-resubmit on save draft
- Allow resubmit for non-rejected statuses

## Error handling
- 400 "Only rejected proposals can be resubmitted"
- 400 { error: "Missing fields", fields: [...] }  ← note: resubmit uses "fields", submit uses "missing_fields"

Match existing form components, validation, and styling.
```

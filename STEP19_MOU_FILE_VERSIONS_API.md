# Step 19 — MOU File Versioning + Ack Reset on Re-Upload (Frontend Integration)

**Backend:** `http://localhost:5000`  
**Auth:** `Authorization: Bearer <token>`

Every MOU **file upload** is saved to version history. Re-uploading after one or both parties acknowledged **resets** acknowledgments and sets `mou_status` back to `uploaded`.

Applies to:
- **Direct MOUS** → `proposals` + `mou_file_versions.proposal_id`
- **Matchmaking** → `mm_matches` (ack/status) + engagement `proposals.mou_file_url` + `mou_file_versions.match_id`

---

## Setup (once)

```bash
cd investment-portal-backend
npm run db:migrate:mou-file-versions
npm run dev
```

Creates table `mou_file_versions`:
- `id`, `proposal_id` (nullable), `match_id` (nullable)
- `file_url`, `uploaded_by`, `uploaded_at`, `version_number`

---

## Business rules

| Rule | Detail |
|------|--------|
| Version on every upload | Each multipart `mou_file` upload inserts a row; history is never deleted |
| Version numbers | Per proposal or per match; always increment (`1, 2, 3…`); never reset |
| Current file | `proposals.mou_file_url` always points to the **latest** upload |
| Ack reset trigger | New file **and** (`mou_status === 'signed'` OR `party_a_acknowledged` OR `party_b_acknowledged`) |
| No prior ack | Upload proceeds silently; `ack_reset: false` |
| After reset | Both ack flags cleared, timestamps null, `mou_status = 'uploaded'` |
| Who can upload | `party_a`, `party_b`, `sector_lead`, `super_admin` (same as before) |
| Who can view versions | `party_a`, `party_b`, `sector_lead`, `super_admin` |
| Acknowledge screen | `GET .../mou/status` returns **all** versions in `versions[]` — not only the latest file |

---

## MOU status now includes all versions

`GET /api/proposals/:id/mou/status` and `GET /api/matchmaking/matches/:id/mou/status` now return the full version list so the acknowledge screen can show every uploaded MOU (v1, v2, …), not just the current file.

**Response `200` (example with 2 uploads):**

```json
{
  "proposal_id": 39,
  "mou_status": "uploaded",
  "mou_file_url": "http://localhost:5000/uploads/mou-v2.pdf",
  "mou_uploaded_by": 5,
  "mou_uploaded_at": "2026-06-04T12:00:00.000Z",
  "party_a_acknowledged": false,
  "party_a_ack_at": null,
  "party_b_acknowledged": false,
  "party_b_ack_at": null,
  "current_version": 2,
  "total_versions": 2,
  "versions": [
    {
      "id": 2,
      "proposal_id": 39,
      "match_id": null,
      "file_url": "http://localhost:5000/uploads/mou-v2.pdf",
      "version_number": 2,
      "uploaded_at": "2026-06-04T12:00:00.000Z",
      "uploaded_by": 5,
      "uploaded_by_name": "Hasnain Lodhi",
      "uploaded_by_email": "sectorlead@test.com",
      "is_current": true
    },
    {
      "id": 1,
      "proposal_id": 39,
      "match_id": null,
      "file_url": "http://localhost:5000/uploads/mou-v1.pdf",
      "version_number": 1,
      "uploaded_at": "2026-06-03T10:00:00.000Z",
      "uploaded_by": 5,
      "uploaded_by_name": "Hasnain Lodhi",
      "uploaded_by_email": "sectorlead@test.com",
      "is_current": false
    }
  ]
}
```

**Frontend rule:** Render `versions[]` as a list/table on the MOU acknowledge panel. Highlight the row where `is_current === true`. Acknowledgment still applies to the **current** MOU (`mou_file_url` / `is_current` version) — older versions are read-only history.

---

## Direct MOUS — upload (updated response)

```
PATCH /api/proposals/:id/mou
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Field:** `mou_file` (file)

**Response `200` when file uploaded:**

```json
{
  "message": "New file uploaded — both parties must re-acknowledge",
  "file_url": "http://localhost:5000/uploads/mou-v2.pdf",
  "version": 2,
  "ack_reset": true,
  "proposal_id": 39,
  "mou_status": "uploaded",
  "mou_uploaded_at": "2026-06-04T12:00:00.000Z",
  "mou": {
    "mou_scope": "...",
    "mou_description": "...",
    "mou_sector": "...",
    "mou_demand": "...",
    "mou_file_url": "http://localhost:5000/uploads/mou-v2.pdf"
  },
  "proposal": { }
}
```

**First upload (no prior ack):**

```json
{
  "message": "File uploaded",
  "file_url": "http://localhost:5000/uploads/mou-v1.pdf",
  "version": 1,
  "ack_reset": false
}
```

**Text-only MOU field updates** (no file) behave as before — no version row, no ack reset.

---

## Direct MOUS — version history

```
GET /api/proposals/:id/mou/versions
Authorization: Bearer <token>
```

**Roles:** `party_a`, `party_b`, `sector_lead`, `super_admin`

**Response `200`:**

```json
{
  "proposal_id": 39,
  "versions": [
    {
      "id": 2,
      "proposal_id": 39,
      "match_id": null,
      "file_url": "http://localhost:5000/uploads/mou-v2.pdf",
      "version_number": 2,
      "uploaded_at": "2026-06-04T12:00:00.000Z",
      "uploaded_by": 5,
      "uploaded_by_name": "Hasnain Lodhi",
      "uploaded_by_email": "sectorlead@test.com"
    },
    {
      "id": 1,
      "proposal_id": 39,
      "match_id": null,
      "file_url": "http://localhost:5000/uploads/mou-v1.pdf",
      "version_number": 1,
      "uploaded_at": "2026-06-03T10:00:00.000Z",
      "uploaded_by": 2,
      "uploaded_by_name": "Party A User",
      "uploaded_by_email": "partya@test.com"
    }
  ]
}
```

Sorted **newest first** (`version_number DESC`).

---

## Matchmaking — upload (updated response)

```
PATCH /api/matchmaking/matches/:id/mou
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Field:** `mou_file` (file)

**Response `200` when file uploaded:**

```json
{
  "message": "New file uploaded — both parties must re-acknowledge",
  "file_url": "http://localhost:5000/uploads/match-mou-v2.pdf",
  "version": 2,
  "ack_reset": true,
  "match_id": 12,
  "engagement_proposal_id": 55,
  "mou_status": "uploaded",
  "mou_uploaded_at": "2026-06-04T12:00:00.000Z",
  "proposal": { }
}
```

Ack reset applies to **`mm_matches`** columns (`mou_ack_by_a`, `mou_ack_by_b`, `mou_status`). File URL is stored on the linked engagement `proposals` row.

---

## Matchmaking — version history

```
GET /api/matchmaking/matches/:id/mou/versions
Authorization: Bearer <token>
```

**Roles:** `party_a`, `party_b`, `sector_lead`, `super_admin`

**Response `200`:**

```json
{
  "match_id": 12,
  "versions": [
    {
      "id": 3,
      "proposal_id": null,
      "match_id": 12,
      "file_url": "http://localhost:5000/uploads/match-mou-v2.pdf",
      "version_number": 2,
      "uploaded_at": "2026-06-04T12:00:00.000Z",
      "uploaded_by": 5,
      "uploaded_by_name": "Hasnain Lodhi",
      "uploaded_by_email": "sectorlead@test.com"
    }
  ]
}
```

---

## Frontend UX recommendations

### 1. After file upload — check `ack_reset`

```ts
const res = await uploadMou(proposalId, file);
if (res.ack_reset) {
  toast.warning(res.message);
  // Refresh GET /mou/status — both parties show un-acknowledged
} else {
  toast.success(res.message);
}
```

### 2. MOU status panel

- Use `GET .../mou/status` — it now includes **`versions[]`** with all uploads
- Show **all versions** in a list (v1, v2, …) with download links
- Mark `is_current: true` row as **Current — acknowledge this version**
- Show **version badge** `v{current_version}` next to current file
- Optional: link **“View history”** still works via `GET .../mou/versions` (same data)

### 3. Version history drawer / modal

| Column | Source |
|--------|--------|
| Version | `version_number` |
| File | `file_url` (download link) |
| Uploaded by | `uploaded_by_name` |
| Date | `uploaded_at` |

Highlight row where `version_number` matches current (first in list = current).

### 4. Signed state guard

If `mou_status === 'signed'` and user uploads a new file:
- Backend resets to `uploaded` automatically
- UI must **not** still show “Signed” — refetch status after upload
- Re-enable ack buttons for both parties

### 5. Matchmaking vs Direct

| Flow | Upload endpoint | Versions endpoint | Status/ack endpoint |
|------|-----------------|-------------------|----------------------|
| Direct MOUS | `PATCH /api/proposals/:id/mou` | `GET /api/proposals/:id/mou/versions` | `GET /api/proposals/:id/mou/status` |
| Matchmaking | `PATCH /api/matchmaking/matches/:id/mou` | `GET /api/matchmaking/matches/:id/mou/versions` | `GET /api/matchmaking/matches/:id/mou/status` |

Use the same UI component; pass `context: 'proposal' | 'match'` and swap base paths.

---

## TypeScript types (suggested)

```ts
export interface MouFileVersion {
  id: number;
  proposal_id: number | null;
  match_id: number | null;
  file_url: string;
  version_number: number;
  uploaded_at: string;
  uploaded_by: number;
  uploaded_by_name: string;
  uploaded_by_email: string;
  is_current?: boolean;
}

export interface MouStatusResponse {
  proposal_id?: number;
  match_id?: number;
  mou_status: string;
  mou_file_url: string | null;
  current_version: number | null;
  total_versions: number;
  versions: MouFileVersion[];
  party_a_acknowledged: boolean;
  party_a_ack_at: string | null;
  party_b_acknowledged: boolean;
  party_b_ack_at: string | null;
}

export interface MouUploadResponse {
  message: string;
  file_url?: string;
  version?: number;
  ack_reset?: boolean;
  mou_status: string;
  // ...existing fields
}

export interface MouVersionsResponse {
  proposal_id?: number;
  match_id?: number;
  versions: MouFileVersion[];
}
```

---

## API service helpers (suggested)

```ts
// proposals
export const getProposalMouVersions = (id: number) =>
  api.get<MouVersionsResponse>(`/proposals/${id}/mou/versions`);

export const uploadProposalMou = (id: number, formData: FormData) =>
  api.patch<MouUploadResponse>(`/proposals/${id}/mou`, formData);

// matchmaking
export const getMatchMouVersions = (matchId: number) =>
  api.get<MouVersionsResponse>(`/matchmaking/matches/${matchId}/mou/versions`);

export const uploadMatchMou = (matchId: number, formData: FormData) =>
  api.patch<MouUploadResponse>(`/matchmaking/matches/${matchId}/mou`, formData);
```

---

## Test flow (manual)

1. Run migration: `npm run db:migrate:mou-file-versions`
2. Upload MOU v1 on approved proposal → `version: 1`, `ack_reset: false`
3. Party A + B acknowledge → `mou_status: signed`
4. Upload MOU v2 → `version: 2`, `ack_reset: true`, `mou_status: uploaded`
5. `GET .../mou/versions` → 2 rows, newest first
6. Repeat on a matchmaking match with same checks

**Test users:** `partya@test.com`, `investor@test.com`, `sectorlead@test.com` / `password123`

---

## Frontend implementation prompt

Copy the block below into your frontend Cursor chat:

```
Implement MOU file versioning UI for the investment portal frontend.

Backend docs: STEP19_MOU_FILE_VERSIONS_API.md (backend repo)

## What changed on backend
- Every MOU file upload creates a version row; version number increments per proposal/match
- Re-upload after ack resets both party acknowledgments and mou_status → 'uploaded'
- Upload response now includes: file_url, version, ack_reset, message
- New endpoints:
  - GET /api/proposals/:id/mou/versions
  - GET /api/matchmaking/matches/:id/mou/versions

## Tasks
1. Update MOU upload handlers (Direct + Matchmaking) to read ack_reset, version, message from PATCH response
2. On MOU acknowledge screen: use `versions[]` from GET .../mou/status — show ALL uploaded MOU files (not only latest)
3. Highlight version where is_current === true; ack button applies to current MOU only
4. If ack_reset === true: show warning toast, refetch status, reset ack UI
5. Reuse one shared MouVersionList component (props: versions, showAckHint for current row)
6. Do not show only mou_file_url — always render full versions[] when total_versions > 1

## Existing APIs (unchanged)
- GET/PATCH .../mou/status and .../mou/acknowledge from STEP17
- PATCH .../mou multipart upload (same endpoint, enriched response)

## UX
- Warning (amber) when ack_reset: "New file uploaded — both parties must re-acknowledge"
- Success (green) when ack_reset false: "File uploaded"
- History is read-only; no delete version

Match existing app styling, API client patterns, and role-based MOU screens.
```

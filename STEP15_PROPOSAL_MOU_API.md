# Step 15 — Direct Opportunity MOU Tab (Party A fills all)

**When:** Legacy `/api/proposals` where Party A submitted Party B + MOU in the same 11-step form.  
**Not for:** Matchmaking V2 engagements — use `GET /api/matchmaking/matches/:id/mou` (unchanged).

---

## Migration (once)

```bash
npm run db:migrate:proposal-mou
```

Adds to `proposals`: `mou_status`, `mou_uploaded_at`, `mou_uploaded_by`.

---

## API

### GET `/api/proposals/:id/mou`

**Roles:** `party_a` (owner), `party_b`, `sector_lead` (same sector), `super_admin`, `regional_focal_point` (read-only)

**Requires:** `capabilities.can_view_mou` — proposal `approved` + Party B linked (same as chat).

**Response:**

```json
{
  "proposal_id": 46,
  "mou_status": "uploaded",
  "mou_uploaded_at": "2026-06-10T12:00:00.000Z",
  "mou": {
    "mou_scope": "...",
    "mou_description": "...",
    "mou_sector": "Agri-chemicals & Inputs",
    "mou_demand": "...",
    "mou_file_url": "http://localhost:5000/uploads/..."
  }
}
```

### PATCH `/api/proposals/:id/mou`

**Roles:** `party_a`, `party_b`, `sector_lead`, `super_admin`  
**Multipart:** `mou_scope`, `mou_description`, `mou_sector`, `mou_demand`, `mou_status`, `mou_file`

**Requires:** `capabilities.can_upload_mou`

---

## Frontend integration

On `/proposals/:id`:

1. Load proposal → read `capabilities.can_view_mou`
2. Try `GET /api/matchmaking/engagement/:id/match` — if match exists, use **matchmaking MOU** tab (existing)
3. Else if `can_view_mou` → show **MOU** tab using:
   - `proposalsApi.getProposalMou(id)`
   - `proposalsApi.saveProposalMou(id, fields, file)`
4. Reuse `<MmMouPanel proposalId={id} />` (no `matchId`)

**Tab URL:** `/proposals/46?tab=mou`

---

## Demo

```bash
npm run db:migrate:proposal-mou
npm run db:seed:demo-reset
```

Login `partya@test.com` → approve as `sectorlead@test.com` → open proposal → **Details | Chat | MOU**

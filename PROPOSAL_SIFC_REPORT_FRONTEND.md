# Single MOU SIFC Report — Frontend

**Ek MOU** ke liye alag SIFC report — conference bulk report se **different format**.

Conference report (`GET /api/proposals/conference-report`) = snapshot + In Execution / Active / Inactive sheets.

Single MOU report = **sirf us MOU ki details + poori progress history**.

---

## Endpoint

```
GET /api/proposals/:id/sifc-report?format={json|xlsx|pdf}
```

| format | Response |
|--------|----------|
| `json` (default) | Preview data |
| `xlsx` | Excel — **2 sheets**: MOU Details + Progress |
| `pdf` | PDF (landscape) — MOU Details + Progress table |

**Auth:** Bearer — `super_admin`, `admin`, `sector_lead`

### Download filenames

- Excel: `SIFC-report-mou-278.xlsx`
- PDF: `SIFC-report-mou-278.pdf` (`&download=1` for attachment)

---

## Excel structure (single MOU)

| Sheet | Content |
|-------|---------|
| **MOU Details** | Chinese/Pak company, SIFC category, sector, value, status, progress, bottleneck, timelines, location, contacts, … |
| **Progress** | Har progress row — date, title, description, source, added by, synced fields, comments (full detail), file URL |

❌ **Nahi aata:** Snapshot, In Execution / Active / Inactive breakdown

---

## JSON response

```json
{
  "report_type": "single_mou",
  "single_mou": true,
  "conference": {
    "key": "pak-china-hangzhou-agri-2026",
    "name": "May 2026 B2B China Conference",
    "report_title": "May 2026 B2B China Conference — MOU Snapshot — MA Group Pakistan"
  },
  "proposal": {
    "id": 277,
    "pak_company": "MA Group Pakistan",
    "chinese_company": "...",
    "sector": "Agri-trade and Export",
    "sifc_category": "Investment – Others",
    "mou_operational_status": "Active",
    "progress": "44"
  },
  "generated_at": "2026-07-07T...",
  "mou_details": [
    { "field": "Chinese Company", "value": "..." },
    { "field": "Progress", "value": "44" }
  ],
  "progress_columns": [
    { "key": "progress_date", "label": "Progress Date" },
    { "key": "comments", "label": "Comments" }
  ],
  "progress_rows": [
    {
      "progress_date": "2026-07-03",
      "title": "MOU progress fields updated",
      "description": "...",
      "source_label": "MOU fields",
      "synced_fields": "Progress: 1 → 44",
      "comments": "Dr. Amer Mumtaz · sector_lead · 2026-07-07: note"
    }
  ],
  "progress_count": 3
}
```

---

## MOU detail page — UI

**Download** dropdown:

| Label | Action |
|-------|--------|
| Download SIFC report (Excel) | `?format=xlsx` |
| Download SIFC report (PDF) | `?format=pdf&download=1` |
| Preview SIFC report | `?format=json` — **single MOU preview component** (conference snapshot preview reuse mat karo) |

```javascript
window.location.href = `/api/proposals/${id}/sifc-report?format=xlsx`;
```

---

## Progress sheet columns

| Column | Source |
|--------|--------|
| Progress Date | `activity_date` |
| Title | row title |
| Description | row description |
| Source | `MOU fields` / `Manual entry` |
| Added By / Role | user who added |
| Synced Fields | MOU field changes (`Progress: old → new`) |
| Comments | Full detail — `Name · role · date: text` (newline per comment) |
| Support File URL | attachment link |

---

## Errors

| Code | When |
|------|------|
| 400 | Draft MOU |
| 403 | No access |
| 404 | Not found |
| 503 | PDF — no Chromium |

---

## Conference vs single MOU

| | Conference report | Single MOU SIFC |
|--|-------------------|-----------------|
| Endpoint | `?conference_key=...` | `/proposals/:id/sifc-report` |
| Sheets | Snapshot + 3 status sections | MOU Details + Progress |
| Progress | Sirf current MOU field | **Poori progress history** |

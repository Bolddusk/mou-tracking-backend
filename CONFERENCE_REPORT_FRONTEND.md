# Conference Report API — Frontend

## Business logic

- Sirf **reportable** conferences (`supports_report: true` in filter-options).
- **super_admin / admin** → conference ke saare non-draft MOUs.
- **sector_lead** → sirf apne `assigned_sectors` ke MOUs.
- **party_a** aur baaki → 403.

---

## Endpoints

`GET /api/proposals/conference-report?conference_key={key}&format={json|xlsx|pdf}`

| format | Response |
|--------|----------|
| `json` (default) | JSON preview data |
| `xlsx` | Styled Excel — 4 sheets |
| `pdf` | Template HTML → PDF (landscape, colors) |

**Auth:** Bearer — `super_admin`, `admin`, `sector_lead`

### Download filenames

- Excel: `SIFC-report-{conference_key}.xlsx` (attachment)
- PDF: `SIFC-report-{conference_key}.pdf` (inline; `&download=1` for attachment)

### Example URLs

```
GET /api/proposals/conference-report?conference_key=pak-china-sep-25-conference
GET /api/proposals/conference-report?conference_key=pak-china-sep-25-conference&format=xlsx
GET /api/proposals/conference-report?conference_key=pak-china-sep-25-conference&format=pdf
```

---

## JSON response (unchanged + optional)

```json
{
  "conference": { "key", "name", "report_title" },
  "scope": { "list_scope", "sector", "sectors" },
  "generated_at": "...",
  "proposal_count": 31,
  "summary_counts": { "in_execution": 4, "active": 18, "inactive": 9 },
  "snapshot": { "rows": [/* data | subtotal | grand_total */] },
  "sections": {
    "in_execution": [{ "sr", "pak_company", "chinese_company", "mou_value_usd_m", "value_label", "outcome", "status_feedback", "action_taken", "tentative_timeline" }],
    "active": [{ "...", "product", "bottlenecks" }],
    "inactive": [{ "...", "product", "bottlenecks" }]
  }
}
```

---

## Excel structure (4 sheets)

1. **Snapshot** — title, headers (#FFF200 / #C5E0B4), data rows, grand total yellow
2. **MoUs in Execution** — header #548235
3. **MoUs (Active)** — Product + Bottlenecks
4. **MoUs (Inactive)** — same as Active

---

## Filter options

`GET /api/proposals/filter-options` → `conferences[].supports_report`

Button dikhao jab `supports_report === true`.

---

## Errors

| Code | When |
|------|------|
| 400 | Missing `conference_key` / invalid format |
| 403 | Role not allowed / conference not reportable |
| 404 | Unknown `conference_key` |

---

## PDF note (first-time setup)

Agar PDF par `500` aaye aur server log mein `Could not find Chrome` ho:

```bash
npm run puppeteer:install-chrome
```

Phir dev server restart karo.

---

- `pak-china-sep-25-conference`
- `pak-china-islamabad-agri-2026`
- `pak-china-hangzhou-agri-2026`

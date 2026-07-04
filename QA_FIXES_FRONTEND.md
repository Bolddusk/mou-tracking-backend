# QA Fixes — Frontend Changes

Short checklist for frontend after backend QA fix deploy.

---

## 1. Chinese / Pakistani company columns (Issue #1)

**Backend now returns explicit fields on every proposal:**

| Field | Meaning |
|-------|---------|
| `pakistani_company` | Pakistani side company name |
| `chinese_company` | Chinese side company name |

**Also available (legacy):**

| Field | Side |
|-------|------|
| `company_name` | Pakistani |
| `party_b_name` | Chinese |

**Do not use** `party_a_name` for company columns — that is the **import owner user** (e.g. Super Admin), not the Pakistani company.

```jsx
// ✅ Correct
<td>{row.pakistani_company ?? row.company_name}</td>
<td>{row.chinese_company ?? row.party_b_name}</td>

// ❌ Wrong
<td>{row.party_a_name}</td>
```

Run on server after deploy: `npm run db:backfill:qa-mou-fixes` (fixes existing 174 MOUs).

---

## 2. Outcome / Description (Issue #2)

Backend now stores **outcome only** in `proposal_description` / `mou_description`.

Extra fields stay in `executive_summary`:

- `progress`
- `bottlenecks`
- `tentative_timeline`
- `sifc_category`

**UI:** Show outcome from `proposal_description` or `executive_summary.project_overview`. Show progress/bottleneck in separate rows if needed — do not expect them inside description text anymore.

---

## 3. Agreement filter status (Issue #3)

**Backend fixed:** `cooperation_mode = agreement` no longer maps to lifecycle `execution`.

Agreement MOUs show **`mou_lifecycle: active`** unless status is literally "In Execution" or deal is closed.

**Frontend:** Use `mou_lifecycle` / `mou_lifecycle_label` from API for status badge. When user filters `cooperation_mode=agreement`, badge should show **Active** (not Execution).

---

## 4. Remove Title column (Issue #4)

Hide **Title** / `proposal_title` column from MOU list and detail headers for conference/imported records.

Use **`venture_name`** or company names if a label is needed. Backend still sends `display_title` for compatibility — prefer not to show a separate Title field.

---

## 5. SIFC Category filter (Issue #5)

**New filter API support:**

```
GET /api/proposals/all?sifc_category=Trade Export
GET /api/proposals/sector-lead?sifc_category=Import Consumption
```

**Filter options** (`GET /api/proposals/filter-options`) now includes:

```json
{
  "sifc_categories": [
    "Bilteral",
    "Investment Export Oriented",
    "Import Consumption",
    "Import Reduction Investment",
    "Investment Import Reduction",
    "Investment Others",
    "Trade Export",
    "Trade Import (Service)"
  ]
}
```

**Frontend:** Add dropdown; pass exact category string as `sifc_category` query param. Echo comes back in `filters.sifc_category`.

---

## 6 & 7. Label renames (Issues #6, #7)

| Old label | New label |
|-----------|-----------|
| Party A | **Pakistani Company** |
| Party B | **Chinese Company** |

Text-only change in tables, forms, filters, and detail pages. API field names unchanged.

---

## Live deploy steps

1. Deploy latest backend
2. Run: `npm run db:backfill:qa-mou-fixes`
3. Apply frontend changes above
4. Hard refresh / redeploy frontend

---

## Quick test

| Check | Expected |
|-------|----------|
| Islamabad MOU row 5 | Pakistani = Pak Agro…, Chinese = Chengdu YIHE… |
| Description | No "SIFC category:" / "Progress:" appended text |
| Filter agreement (2 MOUs) | Status badge = Active |
| SIFC filter | List narrows correctly |
| Columns | No Title; Party A/B renamed |

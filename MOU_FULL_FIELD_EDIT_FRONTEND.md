# MOU Full-Field Edit API — Frontend

## Business logic

- Jo user MOU **detail dekh sakta** hai, woh **saari editable fields** update kar sakta hai (`capabilities.can_edit_fields`).
- **Partial update** — sirf changed fields bhejo.
- **Deal closed** (`status=completed` / `mou_status=deal_closed`) → edit block (sirf `super_admin` / `admin` override).
- **`status`** (draft/submitted/approved/…) is API se change **nahi** hota — approve/reject/resubmit alag endpoints.
- **Sector lead** sector tabhi change kar sakta hai jo uske `assigned_sectors` mein ho.
- **`external_reference`** sirf `super_admin` / `admin`.

---

## 1. Field catalog (form builder)

`GET /api/proposals/:id/editable-fields`

**Auth:** same as detail (`proposals.view` / view_own)

**Response:**
```json
{
  "proposal_id": 213,
  "editable": true,
  "locked": false,
  "reason": null,
  "catalog": {
    "scalar_fields": ["sector", "company_name", "venture_name", "cooperation_mode", "investment_value_usd", "..."],
    "json_fields": ["conference_info", "party_a_info", "executive_summary", "company_overview", "project_overview", "financials", "investment_ask", "contact_info"],
    "executive_summary_keys": ["sifc_category", "mou_operational_status", "progress", "bottlenecks", "tentative_timeline", "action_taken", "location", "..."],
    "enums": {
      "cooperation_mode": ["mou", "jv", "agreement"],
      "mou_operational_status": ["Active", "Inactive", "In Execution"],
      "project_type": ["Greenfield", "Brownfield"],
      "engagement_type": ["G2G", "B2B", "B2G", "G2B"]
    },
    "admin_only_fields": ["external_reference"]
  },
  "sectors": ["Agri-chemicals & Inputs", "..."]
}
```

UI: `editable === false` → read-only; `locked === true` → show lock message.

---

## 2. Update all fields

`PATCH /api/proposals/:id/fields`

**Auth:** detail view access + `can_edit_fields`

**Body:** koi bhi subset of detail fields (nested JSON merge hota hai):

```json
{
  "sector": "Fruits & Vegetables (Production, Cultivation, Processing, Exports)",
  "company_name": "Usmani Global Trading Group",
  "party_b_name": "Xinjiang Xueyu Plateau Import and Export Trade Co. Ltd",
  "cooperation_mode": "mou",
  "investment_value_usd": "10",
  "mou_sub_sector": "Fruits & Vegetables...",
  "proposal_description": "Export of pine nuts to China",
  "conference_key": "pak-china-sep-25-conference",
  "conference_name": "Pak China Sep-25 Conference",
  "executive_summary": {
    "sifc_category": "Trade – Export",
    "mou_operational_status": "In Execution",
    "progress": "Export of pine nuts amounting to USD 10 million...",
    "bottlenecks": "Nil",
    "tentative_timeline": "December 2026",
    "action_taken": "No issue was reported",
    "project_overview": "Export of pine nuts to China"
  },
  "party_a_info": {
    "organization_name": "Usmani Global Trading Group",
    "email": "contact@example.com"
  },
  "investment_ask": {
    "total_project_cost_usd": "10"
  }
}
```

**Response:**
```json
{
  "message": "Proposal fields updated successfully",
  "proposal": { /* full detail shape + mou_lifecycle */ },
  "capabilities": { "can_edit_fields": true, "..." },
  "party_a_profile": { },
  "party_b_profile": { },
  "updated_fields": ["sector", "executive_summary", "party_b_name"]
}
```

---

## Detail response flag

`GET /api/proposals/:id` → `capabilities.can_edit_fields`

```json
"capabilities": {
  "can_edit_fields": true,
  "can_edit_party_contacts": true,
  "can_upload_mou": true
}
```

Har field par edit button: `capabilities.can_edit_fields === true`.

---

## RBAC summary

| Role | Edit? |
|------|-------|
| super_admin, admin | All MOUs (locked override) |
| sector_lead | MOUs in assigned sectors |
| party_a | Own proposals |
| party_b / investor | Linked MOUs (non-draft) |
| focal_point / regional_focal_point | Match engagement MOUs (view = edit) |
| Others | 403 |

---

## Errors

| Code | When |
|------|------|
| 400 | No fields / invalid enum / deal closed / empty sector |
| 403 | No view access / sector outside SL scope / admin-only field |
| 404 | Proposal not found |
| 409 | Duplicate `external_reference` |

---

## Related endpoints (unchanged)

| Action | API |
|--------|-----|
| Party contacts only | `PATCH /api/proposals/:id/party-contacts` |
| MOU file upload | `PATCH /api/proposals/:id/mou` |
| Approve / reject | `PATCH /api/proposals/:id/approve` / `reject` |
| Party A draft wizard | `POST /api/proposals/draft` |

---

## Historic MOU columns (Sep-25 / Islamabad)

| UI column | PATCH field |
|-----------|-------------|
| SIFC Category | `executive_summary.sifc_category` |
| Status | `executive_summary.mou_operational_status` |
| Progress | `executive_summary.progress` |
| Bottleneck | `executive_summary.bottlenecks` |
| Timeline | `executive_summary.tentative_timeline` |
| Action taken | `executive_summary.action_taken` |
| MoU Value | `investment_value_usd` |
| Pak company | `company_name` / `party_a_info.organization_name` |
| Chinese company | `party_b_name` |
| Outcome | `proposal_description` / `executive_summary.project_overview` |
| Sub-sector | `mou_sub_sector` |
| Agreement type | `cooperation_mode` |

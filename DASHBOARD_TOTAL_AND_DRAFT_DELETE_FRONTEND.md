# Dashboard TOTAL (approved only) + Draft Delete — Frontend

## 1. TOTAL / Active / Inactive / Execution counts

`GET /api/proposals/filter-options` → `mou_lifecycle_counts`:

```json
{
  "all": 174,
  "active": 129,
  "inactive": 42,
  "execution": 4
}
```

These counts include **only** proposals with `status` = `approved` or `completed`.

**Not counted:** `draft`, `submitted`, `resubmitted`, `rejected`.

Use as before for top cards — no frontend formula change needed; backend already filters.

---

## 2. Delete draft (and rejected)

### API

```
DELETE /api/proposals/:id
Authorization: Bearer <token>
```

**Who:** Super Admin, Admin, Party A (own proposal)  
**When:** `status` is `draft` or `rejected` only

### Success

```json
{ "message": "Proposal deleted", "id": 501 }
```

### Errors

| Status | Meaning |
|--------|---------|
| `400` | Not draft/rejected (e.g. approved) |
| `403` / `404` | No access |

### List / detail flag

Each row on `GET /api/proposals/all` (and sector-lead list) includes:

```json
{
  "id": 501,
  "status": "draft",
  "capabilities": {
    "can_delete": true
  }
}
```

Detail: `GET /api/proposals/:id` → `capabilities.can_delete`.

### UI

```tsx
{row.capabilities?.can_delete && (
  <button
    title="Delete draft"
    onClick={async () => {
      if (!confirm('Delete this draft permanently?')) return;
      await api.delete(`/api/proposals/${row.id}`);
      refetchList();
    }}
  >
    Delete
  </button>
)}
```

Show delete in Actions column when `can_delete === true` (drafts / rejected). Do **not** show for approved MOUs (use Archive instead).

---

## Checklist

- [ ] TOTAL card uses `mou_lifecycle_counts.all` (approved-only — automatic)
- [ ] Actions: Delete when `capabilities.can_delete`
- [ ] Confirm before delete
- [ ] Refetch list + filter-options counts after delete

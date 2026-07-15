# Chat — Linked users can message (Party B optional)

**Backend change:** Chat no longer waits for Party B link.

---

## Who can chat

| Who | When |
|-----|------|
| **Party A** | Linked to proposal (`party_a_id` = their user) + status `approved` |
| **Super Admin / Admin** | Always on approved MOUs |
| **Sector Lead** | Approved MOU in their sector |
| **Party B / Investor** | Only after `party_b_user_id` links them |

**Rule:** Jo already linked / allowed hai woh message bhej sakta hai. Jo link nahi → uska wait. Poori chat band mat karo.

---

## Capabilities

`GET /api/proposals/:id` → `capabilities`:

```json
{
  "can_view_chat": true,
  "can_send_chat": true
}
```

Ye flags ab **approved** hone par Party A / SA / SL ke liye `true` hain chahe `party_b_user_id` null ho.

---

## Socket join

On Chat tab open (required before Send):

```js
socket.emit('chat:join', { proposalId: 414 });
```

`chat:joined` response:

```json
{
  "proposalId": 414,
  "canSend": true,
  "party_b_linked": false,
  "messages": []
}
```

| Field | Use |
|-------|-----|
| `canSend` | Enable/disable Send |
| `party_b_linked` | Soft info banner only — **do not block** Send |

### Soft banner (optional)

If `party_b_linked === false`:

> Party B is not linked yet — they can join this chat after their email is set.

**Do not** show a blocking error that prevents typing/send for SA / SL / Party A.

### Error you may still see

`Join the chat room before sending messages` → frontend forgot `chat:join` (or join failed). Fix: always join when Chat tab mounts; wait for `chat:joined` then enable Send.

---

## Checklist

- [ ] Always `chat:join` on Chat tab mount
- [ ] Enable Send when `canSend` / `capabilities.can_send_chat`
- [ ] Banner informational only when `party_b_linked === false`
- [ ] Remove hard block “Party B not linked → cannot send”

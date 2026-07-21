# MOU Chat Inbox — General + Private DMs (Frontend)

**Auth:** `Authorization: Bearer <token>`  
**Base:** `/api/proposals/:proposalId`  
**Socket path:** `/socket.io`  
**Auth (socket):** `auth: { token: '<jwt>' }`

WhatsApp-style inbox **inside each MOU Chat tab** only (not a global inbox).

```
MOU Chat tab
├── Left: conversation list
│     ├── General          (everyone on this MOU)
│     └── Direct chats     (1:1 with another participant)
└── Right: active thread + composer
```

**Who can chat:** Party A, Party B (when linked), Sector Lead(s) for the MOU sector, Super Admin.  
**Regional FP:** General only, **read-only** (`canSend: false`). Not in DM picker.  
**Super Admin:** sees **all** conversations (General + every DM) and can send in any of them.

---

## Setup (backend once)

```bash
npm run db:migrate:proposal-chat              # if not already
npm run db:migrate:proposal-chat-conversations
```

Old messages are migrated into **General**. Legacy APIs still work.

---

## UI layout (recommended)

1. On Chat tab open → `GET .../chat/conversations` + `GET .../chat/participants`
2. Left list: pin **General** first; then DMs by `updatedAt`
3. Show `unreadCount` badge per row
4. “New chat” → pick from `participants` → `POST .../chat/conversations` `{ peer_user_id }` → open that conversation
5. Selecting a row → socket `chat:join` with `conversationId` + REST history (or use messages from join)
6. On open / after reading → `POST .../read`
7. Listen `chat:conversations_updated` to refresh left list preview/unread

Use `capabilities.can_view_chat` / `can_send_chat` from proposal detail for tab visibility.

---

## REST APIs

### 1. Inbox (conversation list)

```
GET /api/proposals/:proposalId/chat/conversations
```

**Response:**

```json
{
  "proposalId": 591,
  "canSend": true,
  "conversations": [
    {
      "id": 12,
      "proposalId": 591,
      "type": "group",
      "title": "General",
      "peer": null,
      "lastMessage": {
        "id": 100,
        "proposalId": 591,
        "conversationId": 12,
        "senderId": 3,
        "senderName": "Ali",
        "senderRole": "party_a",
        "text": "Hello",
        "sentAt": "2026-07-21T10:00:00.000Z"
      },
      "unreadCount": 2,
      "updatedAt": "2026-07-21T10:00:00.000Z"
    },
    {
      "id": 44,
      "proposalId": 591,
      "type": "direct",
      "title": "Chen Zhengjun",
      "peer": {
        "id": 88,
        "full_name": "Chen Zhengjun",
        "role": "party_b",
        "email": "chen@example.com"
      },
      "lastMessage": null,
      "unreadCount": 0,
      "updatedAt": "2026-07-21T09:00:00.000Z"
    }
  ]
}
```

**Super Admin DM rows** may also include `peers: [userA, userB]` and title like `"Ali ↔ Chen"`.

---

### 2. People you can DM

```
GET /api/proposals/:proposalId/chat/participants
```

```json
{
  "proposalId": 591,
  "participants": [
    { "id": 88, "full_name": "Chen Zhengjun", "role": "party_b", "email": "..." },
    { "id": 5, "full_name": "Sector Lead", "role": "sector_lead", "email": "..." }
  ]
}
```

Excludes **self**. Includes Party A/B, sector leads, super admins. Use for “New chat” picker.

---

### 3. Start / open a DM

```
POST /api/proposals/:proposalId/chat/conversations
Content-Type: application/json

{ "peer_user_id": 88 }
```

**201** — `{ proposalId, conversation }` (same shape as inbox item). Idempotent: same pair returns existing DM.

---

### 4. Messages in a conversation

```
GET /api/proposals/:proposalId/chat/conversations/:conversationId/messages?limit=100&before=50
```

```json
{
  "proposalId": 591,
  "conversationId": 44,
  "type": "direct",
  "messages": [ /* oldest → newest */ ],
  "hasMore": false,
  "canSend": true
}
```

---

### 5. Mark read

```
POST /api/proposals/:proposalId/chat/conversations/:conversationId/read
{ "last_read_message_id": 100 }
```

Omit `last_read_message_id` to mark latest as read. Clears `unreadCount` for that user.

---

### 6. Legacy General (still works)

```
GET /api/proposals/:proposalId/messages
```

Same as before, plus `conversationId` of General. Keep until FE fully switches.

---

## Socket.io

```ts
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_API_URL, {
  path: '/socket.io',
  auth: { token },
});
```

### Join a conversation

```js
// Preferred
socket.emit('chat:join', { proposalId: 591, conversationId: 44 });

// Legacy = General only
socket.emit('chat:join', { proposalId: 591 });
```

**`chat:joined`**

```json
{
  "proposalId": 591,
  "conversationId": 44,
  "type": "direct",
  "proposalTitle": "...",
  "messages": [],
  "online": [{ "userId": 1, "fullName": "...", "role": "party_a" }],
  "canSend": true,
  "party_b_linked": true
}
```

### Send

```js
socket.emit('chat:message', {
  proposalId: 591,
  conversationId: 44,
  text: 'Hello',
});
```

Omit `conversationId` → sends to **General** (legacy).

Receive same event `chat:message` with `conversationId` on the payload.

**DM messages never appear in General.**

### Typing / leave / presence

```js
socket.emit('chat:typing', { proposalId: 591, conversationId: 44, isTyping: true });
socket.emit('chat:leave', { proposalId: 591, conversationId: 44 });
// listen: chat:typing, chat:presence, chat:error
```

### Inbox live refresh

After join, server also puts you in an inbox room. Listen:

```js
socket.on('chat:conversations_updated', ({ proposalId, conversationId, lastMessage }) => {
  // refresh left list preview / bump unread for other conversations
});
```

---

## Super Admin

| Capability | Behavior |
|------------|----------|
| List | All General + **all DMs** on this MOU |
| Read | Any conversation |
| Send | General + any DM |
| UI tip | Show DM title as `Name A ↔ Name B` using `peers` when present |

---

## FE checklist

- [ ] Chat tab: split pane (list + thread)
- [ ] Load `conversations` + `participants` on open
- [ ] General always first; badge `unreadCount`
- [ ] New chat → `POST` with `peer_user_id`
- [ ] Join/send with `conversationId`
- [ ] Mark read on open
- [ ] Hide composer when `canSend === false`
- [ ] Super Admin sees every DM
- [ ] Do not show Forward / RFP DM options
- [ ] Keep Activity Timeline for formal milestones (chat is informal)

---

## Errors (common)

| Code / HTTP | Meaning |
|-------------|---------|
| 403 chat only after approval | Proposal not approved |
| 400 both users must be participants | Invalid not on this MOU |
| 403 read-only | RFP / locked |
| `chat:error` `NOT_IN_ROOM` | Call `chat:join` before send |

---

## Related

- Old single-thread docs: `STEP10_PROPOSAL_SOCKET_CHAT_API.md` (still valid for General alias)
- Proposal capabilities: `can_view_chat`, `can_send_chat` on `GET /api/proposals/:id`

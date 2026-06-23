# Step 10 — Proposal Party Chat (Socket.io + Saved History)

**Backend:** `http://localhost:5000`  
**Socket path:** `/socket.io`  
**Auth:** JWT from login (`party_a`, `party_b`, `sector_lead`, `super_admin`, or `regional_focal_point` read-only)

After a proposal is **approved** and Party B is linked (`party_b_user_id`), Party A and Party B can chat in real time over **Socket.io**.

**Messages are saved in MySQL** — users can see old chat after refresh. Real-time delivery is still via Socket.io; history is loaded on join and via REST.

Use the **Activity Timeline** for formal milestones — chat is informal messaging between the two parties.

---

## When chat is available

| Condition | Required |
|-----------|----------|
| Proposal `status` | `approved` |
| `party_b_user_id` | Set (happens on sector-lead approve) |
| Logged-in user | See participants table below |

### Participants

| Role | Access | Send messages? |
|------|--------|----------------|
| `party_a` | Owns the proposal (`party_a_id`) | Yes |
| `party_b` | Linked to proposal (`party_b_user_id`) | Yes |
| `sector_lead` | Proposal `sector` matches lead's sector | Yes |
| `super_admin` | Any approved proposal | Yes |
| `regional_focal_point` | Approved matchmaking engagement they created (`mm_matches.proposed_by_rfp`) | **No — read-only** |

`canSend: false` for RFP on REST (`GET /messages`) and socket (`chat:joined`). Hide message input in UI.

`GET /api/proposals/:id` returns `capabilities.can_view_chat` / `can_send_chat` for tab visibility.

---

## Setup

```bash
cd investment-portal-backend
npm install
npm run db:migrate:proposal-chat
npm run dev
```

Creates table `proposal_chat_messages`.

**Frontend dependency:**

```bash
cd investment-portal-frontend
npm install socket.io-client
```

**`.env` (backend):**

```
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=your-secret
```

---

## REST — Load chat history

**`GET /api/proposals/:proposalId/messages`**

**Auth:** Party A, Party B, Sector Lead, or Super Admin (same access rules as socket)

**Query params (optional):**

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `limit` | `100` | `200` | Number of messages (newest batch) |
| `before` | — | — | Message `id` — load older messages before this id (pagination) |

**Example:**

```
GET /api/proposals/25/messages?limit=50
Authorization: Bearer <token>
```

**Response:**

```json
{
  "proposalId": 25,
  "hasMore": false,
  "messages": [
    {
      "id": 1,
      "proposalId": 25,
      "senderId": 2,
      "senderName": "Ali Khan",
      "senderRole": "party_a",
      "text": "Hello — shall we schedule a call?",
      "sentAt": "2026-06-08T10:30:00.000Z"
    }
  ]
}
```

**Load older messages (scroll up):**

```
GET /api/proposals/25/messages?limit=50&before=1
```

Prepends older messages; `hasMore: true` when a full page was returned.

---

## Socket connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('token') },
  transports: ['websocket', 'polling'],
});
```

### Connection errors

| Event / case | Meaning |
|--------------|---------|
| `connect_error` with `Unauthorized` | Missing or invalid JWT |
| `connect_error` with `Unauthorized role for proposal chat` | Role not allowed (e.g. regional focal point) |

---

## Socket events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:join` | `{ proposalId: number }` | Join room + receive saved history |
| `chat:leave` | `{ proposalId: number }` | Leave room |
| `chat:message` | `{ proposalId: number, text: string }` | Send message (saved to DB, max 2000 chars) |
| `chat:typing` | `{ proposalId: number, isTyping: boolean }` | Typing indicator (optional) |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:joined` | See below | Join OK + history + online users |
| `chat:message` | See below | New message (live, already in DB) |
| `chat:presence` | `{ proposalId, online: [...] }` | Online users in room |
| `chat:typing` | `{ proposalId, userId, fullName, role, isTyping }` | Other user typing |
| `chat:error` | `{ code, message }` | Error |

---

## Payload shapes

### `chat:joined`

```json
{
  "proposalId": 25,
  "proposalTitle": "AVRIO Party B Email Test",
  "canSend": true,
  "online": [
    { "userId": 2, "fullName": "Ali Khan", "role": "party_a" },
    { "userId": 5, "fullName": "Sector Lead User", "role": "sector_lead" }
  ],
  "messages": [
    {
      "id": 1,
      "proposalId": 25,
      "senderId": 2,
      "senderName": "Ali Khan",
      "senderRole": "party_a",
      "text": "Hello — shall we schedule a call?",
      "sentAt": "2026-06-08T10:30:00.000Z"
    }
  ]
}
```

`messages` = last 100 saved messages (same as default REST limit).

### `chat:message`

```json
{
  "id": 2,
  "proposalId": 25,
  "senderId": 7,
  "senderName": "Li Wei",
  "senderRole": "party_b",
  "text": "Yes, Thursday works for us.",
  "sentAt": "2026-06-08T10:31:00.000Z"
}
```

`id` is the database integer (use for deduplication and pagination).

### `chat:error` codes

| Code | When |
|------|------|
| `INVALID_PROPOSAL` | Missing `proposalId` |
| `ACCESS_DENIED` | Not approved, not your proposal, or wrong role |
| `NOT_IN_ROOM` | Send before `chat:join` |
| `EMPTY_MESSAGE` | Blank text |
| `MESSAGE_TOO_LONG` | Over 2000 characters |
| `JOIN_FAILED` / `SEND_FAILED` | Server error |

---

## Recommended frontend flow

### 1. Show chat when approved

```javascript
const canChat =
  proposal.status === 'approved' &&
  proposal.party_b_user_id &&
  (user.role === 'party_a' ||
    user.role === 'party_b' ||
    user.role === 'super_admin' ||
    (user.role === 'sector_lead' && user.sector === proposal.sector));
```

Show the message input for every participant — no read-only mode.

### 2. Load history — two options

**Option A (recommended):** Use `chat:joined` → `data.messages` after socket connect.

**Option B:** `GET /api/proposals/:id/messages` on page load, then connect socket for live updates.

Do **not** double-load without deduping by `message.id`.

### 3. React hook example

```javascript
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

function appendMessage(prev, msg) {
  if (prev.some((m) => m.id === msg.id)) return prev;
  return [...prev, msg];
}

export function useProposalChat(proposalId, token) {
  const socketRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [online, setOnline] = useState([]);
  const [connected, setConnected] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!proposalId || !token) return undefined;

    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('chat:join', { proposalId });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('chat:joined', (data) => {
      setOnline(data.online || []);
      setMessages(data.messages || []);
    });

    socket.on('chat:message', (msg) => {
      setMessages((prev) => appendMessage(prev, msg));
    });

    socket.on('chat:presence', (data) => {
      setOnline(data.online || []);
    });

    socket.on('chat:error', (err) => setError(err.message));

    return () => {
      socket.emit('chat:leave', { proposalId });
      socket.disconnect();
    };
  }, [proposalId, token]);

  const loadOlder = useCallback(async () => {
    if (!messages.length || !token) return;
    const before = messages[0].id;
    const res = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/proposals/${proposalId}/messages?limit=50&before=${before}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    setHasMore(data.hasMore);
    setMessages((prev) => {
      const merged = [...(data.messages || []), ...prev];
      const seen = new Set();
      return merged.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    });
  }, [messages, proposalId, token]);

  const sendMessage = (text) => {
    socketRef.current?.emit('chat:message', { proposalId, text });
  };

  const setTyping = (isTyping) => {
    socketRef.current?.emit('chat:typing', { proposalId, isTyping });
  };

  return { messages, online, connected, hasMore, error, sendMessage, setTyping, loadOlder };
}
```

### 4. UI notes

- Scroll to bottom on new message
- “Load older messages” button when `hasMore` is true
- Distinguish bubbles by `senderRole` (`party_a`, `party_b`, `sector_lead`, `super_admin`)
- Banner: *Party A, Party B, Sector Lead, and Super Admin can participate. Use Activity Timeline for formal milestones.*
- Activity Timeline stays separate — do not mix chat into activities

---

## Manual test

1. Run `npm run db:migrate:proposal-chat`
2. Approve a proposal (Party B linked)
3. Browser A: `partya@test.com` — send messages
4. Browser B: Party B user — reply
5. **Refresh both browsers** — old messages should still appear
6. Optional: `GET /api/proposals/25/messages` in Postman with Party A or B token

### Browser console

```javascript
const token = 'PASTE_JWT';
const proposalId = 25;

const s = io('http://localhost:5000', { auth: { token } });
s.on('connect', () => s.emit('chat:join', { proposalId }));
s.on('chat:joined', (d) => console.log('HISTORY', d.messages));
s.on('chat:message', (m) => console.log('LIVE', m));

s.emit('chat:message', { proposalId, text: 'Saved message test' });
```

---

## Architecture

```
Party A / Party B browsers
         |
    Socket.io (live)
         |
    proposal-chat:{id}
         |
    proposal_chat_messages (MySQL)
         ^
    REST GET /messages (history / pagination)
```

- **Real-time:** Socket.io broadcast after DB insert
- **History:** Loaded on `chat:join` + REST for pagination
- **Presence:** In-memory only (who is online now)
- **Activities:** `/api/proposals/:id/activities` — formal milestones only

---

## Backend files

| File | Purpose |
|------|---------|
| `server/socket/proposalChat.js` | Socket.io events |
| `server/utils/proposalChatMessages.js` | Save + load messages |
| `server/controllers/proposalChatController.js` | REST history |
| `server/scripts/migrateProposalChat.js` | DB table |
| `server/utils/proposalAccess.js` | `checkApprovedPartyChatAccess()` |

---

## Related docs

- `STEP5B_PARTY_B_API.md` — Party B account on approve
- `STEP9_PROPOSAL_ENGAGEMENT_API.md` — Proposal form & submit
- `STEP3_ACTIVITIES_API.md` — Formal activity timeline

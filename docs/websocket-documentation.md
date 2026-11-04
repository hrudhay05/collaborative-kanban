# WebSocket documentation

Real-time updates use Socket.IO on the same server and port as the REST API (local: `http://localhost:5000`). The server only pushes changes that have already been committed to the database. All writes still go through the REST API; the socket is for receiving updates and presence.

## 1. Connection and authentication

The client sends the JWT (the same one used for REST) in the handshake:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:5000', { auth: { token } });
```

If the token is missing, invalid or expired, or the user no longer exists, the connection is refused and the client receives `connect_error` with the message `Unauthorized`. Connecting does not put the socket in any tenant room. It must join a tenant explicitly.

## 2. Tenant rooms and authorization

Each tenant has one room named `tenant:<tenantId>`. A socket is only ever placed in a room after the server authorizes it.

**Client to server**

| Event | Payload | Acknowledgement |
| --- | --- | --- |
| `tenant:join` | `{ "tenantId": "<uuid>" }` | Success: `{ ok: true, tenantId, role, online: [{ id, name }] }`. Failure: `{ ok: false, error: "Forbidden" }` (no access or unknown tenant) or `{ ok: false, error: "Invalid request" }` (bad payload) |
| `tenant:leave` | `{ "tenantId": "<uuid>" }` | `{ ok: true }`, or `{ ok: false, error: "Invalid request" }` for a bad payload |

On `tenant:join` the server calls the same membership check used by the REST API (`resolveTenantAccess`) with the user id from the verified token. It never trusts a tenant id sent by the client as proof of access. The user must have a membership in that tenant, or an organization-level membership in the tenant's organization. If not, the ack is `{ ok: false, error }` and the socket does not join the room. A tenant the user does not belong to and a tenant that does not exist are refused the same way.

Successful ack example:

```json
{ "ok": true, "tenantId": "<uuid>", "role": "TENANT_ADMIN", "online": [{ "id": "<uuid>", "name": "Priya Reddy" }] }
```

## 3. Server to client events

Every event below is emitted only to the room `tenant:<tenantId>` of the tenant where the change happened, after the database transaction commits. A failed or rejected write (for example a 409) broadcasts nothing. `actorId` is the user who made the change, so a client can recognise its own change.

| Event | Payload |
| --- | --- |
| `task:created` | `{ task, actorId }` |
| `task:updated` | `{ task, actorId }` |
| `task:moved` | `{ task, actorId }` |
| `task:deleted` | `{ taskId, boardId, actorId }` |
| `board:updated` | `{ type, boardId, board?, column?, columnId?, actorId }` |
| `presence:online` | `{ tenantId, user: { id, name } }` |
| `presence:offline` | `{ tenantId, user: { id, name } }` |
| `presence:update` | `{ tenantId, users }` |

`task` has the same shape as the task in the REST API, including `columnId`, `position` and `version`.

`board:updated` is used for every board and column change. `type` is one of `board:created`, `board:updated`, `board:deleted`, `column:created`, `column:updated`, `column:deleted`. `boardId` can be `null` for `column:deleted`; in that case use `columnId`.

Example `task:moved`:

```json
{
  "task": { "id": "<uuid>", "boardId": "<uuid>", "columnId": "<new column uuid>", "tenantId": "<uuid>", "title": "Set up contact form", "position": 1500, "version": 3 },
  "actorId": "<uuid>"
}
```

Example `board:updated` for a new column:

```json
{ "type": "column:created", "boardId": "<uuid>", "column": { "id": "<uuid>", "name": "Review", "position": 4 }, "actorId": "<uuid>" }
```

## 4. Presence

1. Presence is tracked per user and per tenant, counted by number of sockets.
2. `presence:online` and `presence:update` are emitted when a user's first socket joins the tenant. `presence:offline` and `presence:update` are emitted when their last socket leaves the tenant or disconnects. `presence:update` carries the full list of online users.
3. A second tab does not fire `presence:online` again, and closing one of two tabs keeps the user online.
4. A joining client gets the current online list in the `tenant:join` ack, so it never has to wait for events to know who is online.
5. Joining the same tenant twice on one socket is harmless: the second join is acknowledged but not counted again. A disconnect removes the socket from every tenant it had joined.

## 5. Reconnection behavior

1. Socket.IO reconnects automatically after a network drop or server restart. Rooms are not preserved across a reconnect, so the client rejoins on every `connect` event by emitting `tenant:join` again. The server re-authorizes the join each time.
2. Events emitted while the client was offline are not replayed. After rejoining, the client refetches the board over REST (`GET /api/boards/:id`) so it shows the current state and versions.
3. The UI shows a reconnect banner while disconnected. Bursts of events cause a debounced refetch, so the board converges to the server state.
4. When the user switches tenant, the client emits `tenant:leave` for the old tenant and `tenant:join` for the new one.

## 6. Why the client cannot cross tenants

1. The user identity comes from the verified JWT in the handshake, not from the client payload.
2. Room membership is granted only by a successful server-side membership check at `tenant:join`.
3. Events are emitted to one room per tenant, so a socket in another tenant's room (or in none) never receives them.
4. These rules are verified by `backend/scripts/socket-test.js` (31 checks): users from another tenant or organization are refused on join and receive nothing on task, board and column changes.

## 7. Known limitations

1. Access is checked when the socket joins a tenant, not on every event. If a membership were revoked, an already-joined socket would keep receiving that tenant's events until it disconnects or reconnects.
2. Presence is held in memory in one Node process. Running several server instances would need a shared store and the Socket.IO Redis adapter.
3. Missed events are not replayed. The client recovers by refetching over REST after reconnecting.


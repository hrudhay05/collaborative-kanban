# Real-Time Multi-Tenant Collaborative Kanban Board

A multi-tenant Kanban application where organizations run separate branches (tenants), each with its own boards, columns and tasks, and where changes appear live for everyone in the same tenant.

## 1. Overview

Hierarchy: **Organization -> Tenant (branch) -> Board -> Column -> Task**. Users are linked to organizations and tenants through memberships that carry a role. The backend is a Node.js REST API plus a Socket.IO server. The frontend is a React single page app.

## 2. Business problem

A company with several branches needs one tool where every branch manages its own work without seeing other branches, where an organization-level admin can oversee all of their own branches, and where two companies sharing the same system can never see each other's data. Teams also need to see each other's changes immediately, know who is online, and not silently overwrite each other's edits.

## 3. Features

1. Registration, login and JWT authentication.
2. Organization selector and tenant switcher.
3. Boards with default columns (To Do, In Progress, Testing, Done), and tasks with priority, due date and assignee.
4. Drag and drop of tasks within and across columns, with optimistic UI and rollback on failure.
5. Real-time sync of task, board and column changes inside a tenant.
6. Presence: who is online in the current tenant (multi-tab safe).
7. Automatic reconnection: the client rejoins its tenant room and refetches the board.
8. Optimistic locking: concurrent edits are detected and returned as 409 with the current server task.
9. Task details panel with editing, live stale-version warning and activity history.
10. Role-based access control with three roles.
11. Automated isolation, RBAC and concurrency tests.

## 4. Tech stack and trade-offs

| Part | Choice | Why, and the trade-off |
| --- | --- | --- |
| Backend | Node.js, Express (ES modules) | Simple and well known. Plain JavaScript, not TypeScript, so there is less compile-time safety. Zod validates input at runtime instead. |
| Database | PostgreSQL | Real transactions and row locks, which the move and locking logic needs. |
| ORM | Prisma 6 | Fast schema and migration workflow. Prisma 7 and later are deliberately not used because the project was built on 6. |
| Tenancy | One shared schema with a `tenant_id` column | Simple to run and migrate. The cost is that isolation depends on every query being scoped correctly (see section 6). Schema-per-tenant or database-per-tenant gives stronger physical isolation but is harder to operate. |
| Real time | Socket.IO | Rooms, acknowledgements and automatic reconnection are built in. Presence is held in memory, so it works for a single server process only. |
| Auth | JWT and bcrypt | Stateless and easy to use over both REST and sockets. The token is kept in `localStorage`, which is exposed to XSS, and tokens cannot be revoked before they expire. |
| Validation | Zod | One schema per request, with clear 400 errors. |
| Frontend | React (Vite, JavaScript), Tailwind CSS v4, dnd-kit, axios | Fast dev loop. dnd-kit handles multi-column drag and drop. |

## 5. Architecture

```
Browser (React) --REST + X-Tenant-Id + JWT--> Express routes
        |                                          |
        |                          requireAuth -> requireTenant -> requireRole
        |                                          |
        |                                 controllers (Zod)
        |                                          |
        |                          services (Prisma transactions)
        |                                          |
        |                                    PostgreSQL
        |
        +----Socket.IO (JWT handshake)----> tenant rooms "tenant:<id>"
                                              ^
                    services emit events after commit
```

1. **Layers:** routes -> middleware -> controllers (input validation) -> services (business rules and transactions) -> Prisma.
2. **Writes go through REST only.** The socket is for receiving events and presence. After a transaction commits, the service emits an event to that tenant's room.
3. **Activity log:** every task create, edit, move and delete writes an `activity_logs` row in the same transaction as the change, so history and data cannot disagree.
4. **Frontend:** `AuthContext` and `WorkspaceContext` hold the user and the selected organization and tenant. An axios interceptor adds the token and `X-Tenant-Id`. One socket singleton is shared, and the board page rejoins the tenant room on every connect.

## 6. Tenancy model

**Why organization and tenant are separate.** An organization is the customer (a company). A tenant is one branch of that company. An org admin must oversee all branches of their own company, while a tenant admin and members must only see their own branch. Merging the two would make that impossible.

**How `tenant_id` is assigned.** The client never decides it. For a request, the client sends `X-Tenant-Id` only as a *request to act in* that tenant. The server verifies it (below) and then writes the verified tenant id onto every board, column, task and activity row. A `tenantId` in a request body is not used.

**How it is validated.**
1. `requireAuth` verifies the JWT and loads the user.
2. `requireTenant` reads `X-Tenant-Id` and calls `resolveTenantAccess(userId, tenantId)`. Access exists only if the user has a membership in that tenant, or an organization-level membership (tenant id null) in the tenant's organization. The role comes from that membership, never from the client.
3. If there is no access, or the tenant does not exist, the response is the same 403, so tenant ids cannot be enumerated.

**How isolation is enforced.**
1. Every board, column and task lookup uses the id **and** the verified tenant id. An id from another tenant returns 404, identical to a non-existent id.
2. Creating or moving a task checks that the board and column belong to the verified tenant.
3. A task assignee must have access to the tenant, otherwise 400.
4. An org admin reaches only tenants of their own organization.

**How WebSocket rooms are scoped.** There is one room per tenant, `tenant:<id>`. A socket joins only after the server runs the same membership check. Events are emitted only to that room, so other tenants and other organizations receive nothing. Details are in `docs/websocket-documentation.md`.

**How cross-tenant access is prevented.** By the checks above on every path: REST (header check plus scoped lookups) and WebSocket (join check plus room-only emits). This is verified by `backend/scripts/http-test.js` (76 checks) and `backend/scripts/socket-test.js` (31 checks).

## 7. Role-based access control

| Role | Scope | Can do |
| --- | --- | --- |
| `ORG_ADMIN` | Organization-level membership (tenant id null) | Everything below, in every tenant of their own organization. Create and rename tenants. |
| `TENANT_ADMIN` | One tenant | Create, rename and delete boards. Add, rename and delete columns. Delete tasks. Everything a member can do. |
| `MEMBER` | One tenant | View boards. Create, edit and move tasks. |

Roles are ordered `MEMBER` < `TENANT_ADMIN` < `ORG_ADMIN`, and each route declares a minimum role. A role never carries over between tenants. An exact table per endpoint is in `docs/api-documentation.md`.

## 8. Database design

Tables: `organizations`, `tenants`, `users`, `memberships`, `boards`, `columns`, `tasks`, `activity_logs`. All ids are UUIDs.

1. `tenants` are unique per organization by name.
2. `memberships` link a user to an organization and optionally a tenant, with a role. A null tenant means an organization-level membership.
3. `tasks` have `position` (gap-based integer) and `version` (starts at 1, increased on every change) for ordering and optimistic locking.
4. `activity_logs` store the tenant, user, entity, action and a JSON `details` field. There is no foreign key on `entity_id`, so history survives deleted tasks.

The ER diagram, schema source and design notes are in `docs/database-erd.png`, `docs/database.dbml` and `docs/database-erd.md`. Known database limitations are listed in section 17.

## 9. Real-time communication

Socket.IO runs on the same server and port as the REST API. Full details and payloads are in `docs/websocket-documentation.md`.

1. **Handshake:** the client sends its JWT in `auth.token`. An invalid token is refused with `Unauthorized`.
2. **Join:** the client emits `tenant:join` with a tenant id. The server runs the same membership check as REST and only then adds the socket to the room `tenant:<id>`. The ack carries the role and the list of online users.
3. **Events:** after a database transaction commits, the service emits `task:created`, `task:updated`, `task:moved`, `task:deleted` or `board:updated` to that tenant's room only. A rejected write (for example a 409) broadcasts nothing.
4. **Presence:** tracked per user per tenant and counted by sockets, so several tabs count as one online user. `presence:online` fires for the first tab and `presence:offline` for the last.
5. **Reconnection:** rooms are not kept across a reconnect. The client rejoins on every `connect` and refetches the board over REST. Missed events are not replayed, so the refetch is what restores the correct state. A banner shows while the connection is down.
6. **Why the socket is receive-only for data:** all writes go through REST, so validation, roles, locking and the activity log exist in one place.

## 10. Concurrency handling

1. **Optimistic locking.** Every task has a `version`. Edit, move and delete requests carry the version the client last saw. If it no longer matches, nothing is written and the server returns **409** with the current task in `details.current`. Each successful change increases the version by one.
2. **What the user sees.** In the details panel, a live event for the task being edited shows a stale-version banner, and a 409 on save shows the conflict with the server's current values. A failed drag and drop rolls the card back to its previous place.
3. **Ordering.** Positions are gap-based integers (1000, 2000, ...). A move inserts at the midpoint, and the column is rebalanced when the gap runs out. The client sends the final index in the destination column and the server computes the position.
4. **Concurrent moves.** A move locks the source and destination columns inside a transaction, so simultaneous moves are serialized, with no duplicate positions and no lost or duplicated tasks.
5. **Atomic history.** The activity log row is written in the same transaction as the change. A rejected write leaves no log entry.
6. **Verified by tests** (`backend/scripts/http-test.js`): simultaneous edits give exactly one winner, simultaneous moves of the same task give one winner with the task shown once, 12 parallel moves into one column all succeed with unique positions, and edit versus delete never both succeed.

## 11. Installation

Requirements: Node.js 20 or newer (built with v24), npm, Git, PostgreSQL 17 (any recent version should work).

1. Clone and install:

```powershell
git clone https://github.com/hrudhay05/collaborative-kanban.git
cd collaborative-kanban
cd backend
npm install
cd ..\frontend
npm install
cd ..
```

2. Create the database and user (in `psql` as the postgres user):

```sql
CREATE USER kanban_user WITH PASSWORD 'your_password';
CREATE DATABASE collaborative_kanban OWNER kanban_user;
```

3. Create `backend/.env` from the root `.env.example` (see section 12), then apply the migrations and seed the data:

```powershell
cd backend
Copy-Item ..\.env.example .env
# edit .env: set DATABASE_URL password and JWT_SECRET
npx prisma migrate dev
npx prisma db seed
```

`kanban_user` must be allowed to create databases for `migrate dev` (it creates a shadow database). If it is not, run `ALTER USER kanban_user CREATEDB;` as the postgres user.

## 12. Environment variables

**backend/.env** (git-ignored; template is the root `.env.example`)

| Variable | Meaning |
| --- | --- |
| `PORT` | API and Socket.IO port, default 5000 |
| `CLIENT_URL` | Allowed browser origin for CORS and Socket.IO, `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign tokens. Use a long random value |
| `JWT_EXPIRES_IN` | Token lifetime, for example `7d` |

**frontend/.env** (git-ignored; template is `frontend/.env.example`)

| Variable | Meaning |
| --- | --- |
| `VITE_API_URL` | Backend base URL, `http://localhost:5000` |

Never commit a real `.env` file.

## 13. Running the app

Open two terminals.

```powershell
# terminal 1
cd backend
npm run dev      # http://localhost:5000

# terminal 2
cd frontend
npm run dev      # http://localhost:5173
```

Seeded logins (password for all: `Password@123`):

| Email | Name | Role |
| --- | --- | --- |
| rahul@abc.com | Rahul Sharma | ORG_ADMIN of ABC Technologies (all ABC tenants) |
| priya@abc.com | Priya Reddy | TENANT_ADMIN, Hyderabad |
| arjun@abc.com | Arjun Kumar | MEMBER, Hyderabad |
| sneha@abc.com | Sneha Iyer | TENANT_ADMIN, Bangalore |
| kiran@xyz.com | Kiran Patel | MEMBER, Mumbai (XYZ Solutions) |

Seed data: organizations ABC Technologies (Hyderabad, Bangalore, Chennai) and XYZ Solutions (Mumbai, Pune), 5 boards, 18 tasks. Re-running `npx prisma db seed` wipes and recreates everything, and all ids change.

To try real time and presence, log in as Priya in one browser and Arjun in a private window, and open the same Hyderabad board.

## 14. API and WebSocket documentation

1. REST API: `docs/api-documentation.md`
2. WebSocket events: `docs/websocket-documentation.md`

## 15. Testing

Both scripts talk to a running backend, so start `npm run dev` in `backend` first. **Re-seed before each run**, because the seed resets all ids and the scripts expect clean data.

```powershell
cd backend
npx prisma db seed
node scripts\http-test.js      # 76 checks
npx prisma db seed
node scripts\socket-test.js    # 31 checks
```

1. `http-test.js` covers cross-tenant id guessing, header and token tampering, cross-organization isolation, body tampering, role-based access, tenant management, and concurrency (simultaneous edits, moves, deletes). It writes its result to `docs/http-test-report.txt`.
2. `socket-test.js` covers handshake refusal, join authorization, event delivery only inside the right tenant, 409 broadcasting nothing, and multi-tab presence.
3. The frontend flows (two-browser live sync, presence, reconnect, 409 handling) were tested manually. There are no automated frontend tests.

## 16. Known limitations

1. **No membership management yet.** There is no API or screen to add users to a tenant, change roles or assign tenant admins. Memberships exist only through the seed.
2. **No register page in the UI.** The `POST /api/auth/register` endpoint works, but the frontend only has a login page. A newly registered user belongs to no tenant until a membership exists.
3. **No admin UI for tenants, boards and columns.** The APIs and live events exist, and the frontend does not yet offer create, rename or delete for them. The dashboard board list is not live.
4. **Presence is in memory.** It works for one server process only. Several instances would need a shared store and the Socket.IO Redis adapter.
5. **Access is checked at join time for sockets.** A revoked membership would keep receiving events until the socket reconnects.
6. **Missed events are not replayed.** After a reconnect the client refetches the board instead.
7. **JWT in `localStorage`.** It is exposed to XSS, and tokens cannot be revoked before they expire.
8. **Database:** a null `tenant_id` does not satisfy the unique constraint on memberships, so duplicate organization-level rows are possible at the database level. The `tenant_id` copied onto columns and tasks is enforced by the service layer, not by a composite foreign key. Row-level security is not used.
9. **No pagination** on lists, and no rate limiting.

## 17. Future enhancements

1. Membership management API and User Management screen.
2. Register page, tenant, board and column admin UI.
3. PostgreSQL row-level security as a second isolation layer, and composite foreign keys on `(tenant_id, id)`.
4. Redis adapter and shared presence for multiple server instances.
5. Refresh tokens and httpOnly cookies.
6. Pagination, rate limiting and audit export.
7. Read-only AI assistant service (Python/FastAPI) with allowlisted tools and a verified tenant context.

## 18. Screenshots

Screenshots are stored in `screenshots/` (login, organization and tenant selector, Kanban board, task details, presence, activity history). They will be added before submission.

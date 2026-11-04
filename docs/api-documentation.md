# API documentation

Base URL (local): `http://localhost:5000`. Requests and responses are JSON. Automated proof of the isolation, role and concurrency rules below is in `docs/http-test-report.txt` (`backend/scripts/http-test.js`).

## Conventions

**Authentication.** Send `Authorization: Bearer <token>`. The token is a JWT returned by login or register. Its subject is the user id, and it expires after `JWT_EXPIRES_IN` (7 days by default).

**Tenant scoping.** Routes marked *Tenant: yes* also need the header `X-Tenant-Id: <tenant uuid>`. The server does not trust it. It checks that the authenticated user has a membership that grants access to that tenant (a membership in the tenant, or an organization-level membership in the tenant's organization) and takes the role from that membership.

**Roles.** `MEMBER` < `TENANT_ADMIN` < `ORG_ADMIN`. A route's *Role* is the minimum role required.

**Errors.** Body is `{ "error": "<message>", "details": <optional> }`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid input (validation errors listed in `details`), malformed JSON, or an assignee outside the tenant |
| 401 | Missing, invalid or expired token |
| 403 | Role too low, or the tenant is not accessible to this user |
| 404 | Not found, or the id belongs to another tenant |
| 409 | Version conflict, duplicate (email, tenant name), or deleting a column that still has tasks |
| 500 | Unexpected server error |

## Tenancy rules enforced by every tenant-scoped route

1. The tenant comes only from a verified membership, never from the request body. A `tenantId` in a body is never used to choose the tenant.
2. An unknown tenant id and a tenant the user does not belong to return the same 403, so tenant ids cannot be enumerated.
3. Boards, columns and tasks are always looked up by id **and** the verified tenant. An id from another tenant returns 404, identical to a non-existent id.
4. An Org Admin reaches every tenant of their own organization and nothing outside it.
5. A task assignee must have access to the tenant, otherwise 400.

## Health

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | none | `200 { "status": "ok", "message": "The server is running" }` |

## Authentication

Tenant: no.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | none | Create an account |
| POST | `/api/auth/login` | none | Log in |
| GET | `/api/auth/me` | token | Current user |

**POST /api/auth/register** body:

| Field | Rules |
| --- | --- |
| `name` | string, 1 to 100 characters |
| `email` | valid email, stored lower case |
| `password` | string, 8 to 72 characters (stored as a bcrypt hash) |
| `organizationName` | optional string, 1 to 100 characters |

Response `201 { "user": {...}, "token": "<jwt>" }`. Errors: 400 validation, 409 email already registered.

With `organizationName`, the server creates the organization and makes the user its ORG_ADMIN. The new organization has no tenants yet. Without it, the user belongs to no organization.

**POST /api/auth/login** body `{ "email": "...", "password": "..." }`. Response `200 { "user": { "id", "name", "email" }, "token": "<jwt>" }`. Errors: 400 validation, 401 wrong credentials.

**GET /api/auth/me** response `200 { "user": { "id", "name", "email" } }`. Error: 401.

## Organizations

Tenant: no. Requires a token.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/organizations` | Organizations the user belongs to: `{ "organizations": [{ "id", "name", "createdAt", "isOrgAdmin" }] }` |
| POST | `/api/organizations` | Body `{ "name": "<1-100 chars>" }`. Response `201 { "organization": {...} }`. The creator becomes ORG_ADMIN (`isOrgAdmin` is true) |
| GET | `/api/organizations/:orgId` | `{ "organization": {...} }`. 403 or 404 if the user is not a member |
| GET | `/api/organizations/:orgId/tenants` | `{ "tenants": [...] }`. 403 or 404 if the user is not a member |

## Tenants

Tenant: no. Requires a token.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/api/tenants` | any | Every tenant the user can access, each with the user's role |
| POST | `/api/tenants` | ORG_ADMIN of the organization | Body `{ "organizationId": "<uuid>", "name": "<1-100 chars>" }`. `201 { "tenant": {...} }`. 409 if the name already exists in the organization. Non-admins get 403 "Only an org admin can create tenants" |
| PATCH | `/api/tenants/:id` | ORG_ADMIN of the organization | Body `{ "name": "<1-100 chars>" }`. `200 { "tenant": {...} }`. Tenant admins, members and admins of other organizations get 403 |

`GET /api/tenants` response:
```json
{
  "tenants": [
    {
      "id": "<uuid>",
      "organizationId": "<uuid>",
      "name": "Hyderabad",
      "createdAt": "2026-11-03T20:45:16.477Z",
      "organization": { "id": "<uuid>", "name": "ABC Technologies" },
      "role": "ORG_ADMIN"
    }
  ]
}
```

## Members

Tenant: yes.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/api/members` | MEMBER | People who can work in this tenant, sorted by name. `{ "members": [{ "id", "name", "role" }] }`. `role` is the person's highest role here. Organization admins are included |

## Boards

Tenant: yes.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/api/boards` | MEMBER | `{ "boards": [...] }` for the tenant |
| POST | `/api/boards` | TENANT_ADMIN | Body `{ "name": "<1-100>", "description": "<max 500, optional, nullable>" }`. `201 { "board": {...} }`. Creates the four default columns To Do, In Progress, Testing, Done in the same transaction |
| GET | `/api/boards/:id` | MEMBER | Board with its columns and their tasks (below) |
| PATCH | `/api/boards/:id` | TENANT_ADMIN | Body with `name` and/or `description` (at least one). `200 { "board": {...} }` |
| DELETE | `/api/boards/:id` | TENANT_ADMIN | `200 { "deleted": true }` |
| GET | `/api/boards/:id/columns` | MEMBER | `{ "columns": [...] }` |
| POST | `/api/boards/:id/columns` | TENANT_ADMIN | Body `{ "name": "<1-50>" }`. `201 { "column": {...} }`. The server assigns the position |

`GET /api/boards/:id` response:
```json
{
  "board": {
    "id": "<uuid>", "organizationId": "<uuid>", "tenantId": "<uuid>",
    "name": "Website Development", "description": "...", "createdBy": "<uuid>", "createdAt": "...",
    "columns": [
      {
        "id": "<uuid>", "boardId": "<uuid>", "tenantId": "<uuid>", "name": "To Do", "position": 0,
        "tasks": [
          {
            "id": "<uuid>", "boardId": "<uuid>", "columnId": "<uuid>", "tenantId": "<uuid>",
            "title": "Set up contact form", "description": "...", "assignedTo": "<uuid or null>",
            "priority": "LOW", "dueDate": "2026-11-10T20:55:11.763Z", "position": 1000,
            "version": 1, "createdAt": "...", "updatedAt": "..."
          }
        ]
      }
    ]
  }
}
```

## Columns

Tenant: yes.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| PATCH | `/api/columns/:id` | TENANT_ADMIN | Body with `name` (1-50) and/or `position` (integer, 0 or more), at least one. `200 { "column": {...} }` |
| DELETE | `/api/columns/:id` | TENANT_ADMIN | `200 { "deleted": true }`. 409 if the column still has tasks |

## Tasks

Tenant: yes. Any tenant member can create, edit and move tasks. Only TENANT_ADMIN and above can delete them.

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/api/tasks?boardId=<uuid>` | MEMBER | `{ "tasks": [...] }` |
| POST | `/api/tasks` | MEMBER | Create a task |
| GET | `/api/tasks/:id` | MEMBER | `{ "task": {...} }` |
| GET | `/api/tasks/:id/activity` | MEMBER | `{ "activity": [...] }`, newest first |
| PATCH | `/api/tasks/:id` | MEMBER | Edit with optimistic locking |
| PATCH | `/api/tasks/:id/move` | MEMBER | Move or reorder with optimistic locking |
| DELETE | `/api/tasks/:id` | TENANT_ADMIN | Delete. Optional `?version=<n>` |

**POST /api/tasks** body:

| Field | Rules |
| --- | --- |
| `boardId` | uuid, a board of this tenant |
| `columnId` | uuid, a column of that board |
| `title` | string, 1 to 200 characters |
| `description` | optional, up to 2000 characters, nullable |
| `assignedTo` | optional uuid or null. The user must have access to the tenant, else 400 |
| `priority` | optional `LOW`, `MEDIUM` (default) or `HIGH` |
| `dueDate` | optional date string or null |

Response `201 { "task": {...} }`. The task is added at the end of the column. A board or column from another tenant returns 400 or 404.

**PATCH /api/tasks/:id** body needs `version` (integer, 1 or more, the version the client last saw) plus at least one of `title`, `description`, `assignedTo`, `priority`, `dueDate`. Response `200 { "task": {...} }` with `version` increased by one.

**PATCH /api/tasks/:id/move** body:
```json
{ "columnId": "<destination column uuid>", "index": 0, "version": 3 }
```
`index` is the task's final position in the destination column (0 is the top). Response `200 { "task": {...} }` with the new `columnId`, `position` and `version`.

**Version conflict (PATCH, move and DELETE with `?version`).** If `version` is not the task's current version, nothing is written and the response is:
```json
{ "error": "<message>", "details": { "current": { "...": "the current server task" } } }
```
with status **409**. The client should show the conflict and continue from `details.current`.

**Ordering.** Positions are gaps (1000, 2000, ...). A move inserts at the midpoint, and the column is rebalanced when the gap runs out. Moves lock the source and destination columns inside a transaction, so concurrent moves are serialized. The server decides the final order.

**DELETE /api/tasks/:id** response `200 { "deleted": true, "task": {...} }`.

**Activity entries** (every create, edit, move and delete writes one in the same transaction as the change):
```json
{
  "id": "<uuid>", "tenantId": "<uuid>", "userId": "<uuid>",
  "entityType": "TASK", "entityId": "<task uuid>",
  "action": "MOVED",
  "details": { "from": { "id": "<uuid>", "name": "To Do" }, "to": { "id": "<uuid>", "name": "In Progress" }, "version": 3, "position": 500 },
  "createdAt": "...", "user": { "id": "<uuid>", "name": "Priya Reddy" }
}
```
`action` is `CREATED`, `UPDATED`, `MOVED` or `DELETED`. `details` for `CREATED` is `{ board, title, column }`. For `UPDATED` it is `{ changed: ["title", ...], version }`. Rejected writes (409) create no entry.

Unknown routes return `404 { "error": "Route not found" }`. A missing or malformed `X-Tenant-Id` returns 400 or 403.

WebSocket events are documented in `docs/websocket-documentation.md`.


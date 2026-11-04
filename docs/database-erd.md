# Database design

PostgreSQL, managed with Prisma (`backend/prisma/schema.prisma` and `backend/prisma/migrations/`). The image export is in `docs/database-erd.png`, and the editable source is `docs/database.dbml`.

```mermaid
erDiagram
  organizations ||--o{ tenants : has
  organizations ||--o{ memberships : has
  organizations ||--o{ boards : has
  tenants |o--o{ memberships : "scopes (null = org-level)"
  tenants ||--o{ boards : owns
  tenants ||--o{ columns : owns
  tenants ||--o{ tasks : owns
  tenants ||--o{ activity_logs : owns
  users ||--o{ memberships : has
  users ||--o{ boards : creates
  users |o--o{ tasks : "assigned to"
  users ||--o{ activity_logs : performs
  boards ||--o{ columns : has
  boards ||--o{ tasks : has
  columns ||--o{ tasks : contains

  organizations {
    uuid id PK
    varchar name
    timestamp created_at
    timestamp updated_at
  }
  tenants {
    uuid id PK
    uuid organization_id FK
    varchar name "unique per organization"
    timestamp created_at
  }
  users {
    uuid id PK
    varchar name
    varchar email UK
    varchar password_hash "bcrypt"
    timestamp created_at
  }
  memberships {
    uuid id PK
    uuid user_id FK
    uuid organization_id FK
    uuid tenant_id FK "nullable, null = org-level"
    enum role "ORG_ADMIN, TENANT_ADMIN, MEMBER"
    timestamp created_at
  }
  boards {
    uuid id PK
    uuid organization_id FK
    uuid tenant_id FK "isolation key"
    varchar name
    text description
    uuid created_by FK
    timestamp created_at
  }
  columns {
    uuid id PK
    uuid board_id FK
    uuid tenant_id FK "isolation key"
    varchar name
    int position
  }
  tasks {
    uuid id PK
    uuid board_id FK
    uuid column_id FK
    uuid tenant_id FK "isolation key"
    varchar title
    text description
    uuid assigned_to FK "nullable"
    enum priority "LOW, MEDIUM, HIGH"
    timestamp due_date
    int position "gap-based ordering"
    int version "optimistic lock"
    timestamp created_at
    timestamp updated_at
  }
  activity_logs {
    uuid id PK
    uuid tenant_id FK "isolation key"
    uuid user_id FK
    varchar entity_type
    uuid entity_id "no FK, survives deletes"
    varchar action
    jsonb details
    timestamp created_at
  }
```

## How the schema supports tenant isolation

1. `boards`, `columns`, `tasks` and `activity_logs` each carry a NOT NULL `tenant_id`, indexed. Every query in the backend filters by the tenant that was verified from the user's membership, never by a tenant id the client sends.
2. Composite indexes serve the common tenant-scoped reads: `tasks (tenant_id, board_id)`, `tasks (column_id, position)`, `activity_logs (tenant_id, created_at)`.
3. `memberships.tenant_id` is nullable. NULL means an organization-level role (Org Admin, reaching every tenant of that organization). A set value means a role inside one tenant.
4. Foreign keys cascade from organization and tenant, so removing a tenant removes its boards, columns, tasks and logs.
5. `tasks.version` implements optimistic locking, and `tasks.position` uses gaps (1000, 2000, ...) so a move usually updates one row.
6. `activity_logs.entity_id` has no foreign key on purpose, so the history of a deleted task is kept.

## Known limitations

1. PostgreSQL treats NULLs as distinct in a unique constraint, so the `(user_id, organization_id, tenant_id)` constraint does not stop duplicate org-level memberships (tenant_id NULL). A partial unique index would close this.
2. `tenant_id` on `columns` and `tasks` duplicates the board's tenant for fast filtering. The service layer keeps them equal. The database itself does not enforce that, and PostgreSQL Row-Level Security would be the extra layer.
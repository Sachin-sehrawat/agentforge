# Audit Log

## Purpose

`audit_log` is a tamper-resistant, append-only compliance record of create, modify, and delete actions on key entities (agents, skills, etc.). It is distinct from the `agent_events` analytics table, which tracks product-level usage for agent owners. Audit rows are for admins and compliance reviewers.

## Schema

| Column                | Type        | Notes                                          |
|-----------------------|-------------|------------------------------------------------|
| `id`                  | BIGSERIAL   | Monotonic primary key                          |
| `actor_id`            | UUID        | Nullable — null for system-initiated actions   |
| `actor_email_snapshot`| TEXT        | Denormalized at write time; survives user deletion |
| `action`              | TEXT        | e.g. `agent.create`, `agent.update`, `agent.delete`, `agent.visibility_change`, `skill.delete` |
| `entity_type`         | TEXT        | e.g. `agent`, `skill`                         |
| `entity_id`           | UUID        | ID of the affected row                         |
| `before`              | JSONB       | Snapshot of the row before the change (nullable for creates) |
| `after`               | JSONB       | Snapshot of the row after the change (nullable for deletes) |
| `ip`                  | TEXT        | Request IP; nullable for internal/system actions |
| `created_at`          | TIMESTAMPTZ | Set by DB default; never written by application |

Indexes: `idx_audit_entity (entity_type, entity_id, created_at DESC)` and `idx_audit_actor (actor_id, created_at DESC)`.

## Application Usage

Use `writeAudit` from `backend/src/audit.js`:

```js
import { writeAudit } from '../audit.js';

await writeAudit({
  actor: { id: req.user.id, email: req.user.email },
  action: 'agent.update',
  entityType: 'agent',
  entityId: agent.id,
  before: agentBefore,
  after: agentAfter,
  ip: req.ip,
});
```

`writeAudit` is **best-effort**: it swallows its own errors so that an audit failure never rolls back the primary database transaction or surfaces an error to the user. Failures are emitted to server logs.

**There are no UPDATE or DELETE code paths for `audit_log` anywhere in the application.** Do not add any.

## Production Deployment Requirement

The append-only property is a compliance guarantee. Application-layer discipline (no UPDATE/DELETE code) is necessary but not sufficient. In production, the database role used by the application **must** have UPDATE and DELETE revoked on `audit_log`:

```sql
REVOKE UPDATE, DELETE ON audit_log FROM agentforge_app;
```

This ensures that even a compromised application process cannot tamper with audit records. This grant change should be applied as part of the initial production setup and verified during security reviews.

A separate privileged role (e.g. `agentforge_admin`) may retain DELETE rights for lawful retention purges, but that role must not be used by the application server.

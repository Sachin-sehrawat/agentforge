import { query } from './db.js';

/**
 * Append an immutable audit record. Best-effort: failures are logged but never
 * thrown to the caller and never roll back the surrounding transaction.
 *
 * @param {object} opts
 * @param {{ id: string, email?: string } | null} opts.actor  - null for system actions
 * @param {string} opts.action       - e.g. 'agent.create', 'agent.delete'
 * @param {string} opts.entityType   - e.g. 'agent', 'skill'
 * @param {string} opts.entityId     - UUID of the affected row
 * @param {object} [opts.before]     - snapshot before the change
 * @param {object} [opts.after]      - snapshot after the change
 * @param {string} [opts.ip]         - request IP address
 */
export async function writeAudit({ actor, action, entityType, entityId, before, after, ip }) {
  try {
    const actorId = actor?.id ?? null;
    const actorEmail = actor?.email ?? null;

    await query(
      `INSERT INTO audit_log
         (actor_id, actor_email_snapshot, action, entity_type, entity_id, before, after, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorId,
        actorEmail,
        action,
        entityType,
        entityId,
        before != null ? JSON.stringify(before) : null,
        after  != null ? JSON.stringify(after)  : null,
        ip ?? null,
      ]
    );
  } catch (err) {
    // Audit failure must never surface to the user or abort the primary action.
    console.error('[audit] writeAudit failed:', err.message, { action, entityType, entityId });
  }
}

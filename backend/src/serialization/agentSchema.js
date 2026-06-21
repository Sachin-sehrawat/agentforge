export const AGENT_SCHEMA_VERSION = 1;

/**
 * Converts a PostgreSQL agent row (snake_case) to the canonical JSON envelope.
 * Excludes DB-internal fields: id, owner_id, created_at, updated_at, visibility.
 * Key order is fixed so serialized output is deterministic across calls.
 */
export function toCanonical(agentRow) {
  return {
    schemaVersion: AGENT_SCHEMA_VERSION,
    name: agentRow.name ?? '',
    persona: agentRow.persona ?? '',
    systemPrompt: agentRow.system_prompt ?? '',
    model: agentRow.model ?? '',
    tools: agentRow.tools ?? [],
    skills: agentRow.skills ?? [],
    instructions: agentRow.instructions ?? [],
    positions: agentRow.positions ?? {},
  };
}

export const AGENT_SCHEMA_VERSION = 1;

/**
 * Converts a frontend agent object (camelCase, as returned by the API) to the
 * canonical JSON envelope. Excludes API-surface fields that have no meaning
 * outside a specific database: id, ownerId, visibility, createdAt, updatedAt.
 */
export function serializeAgent(agent) {
  return {
    schemaVersion: AGENT_SCHEMA_VERSION,
    name: agent.name ?? '',
    persona: agent.persona ?? '',
    systemPrompt: agent.systemPrompt ?? '',
    model: agent.model ?? '',
    tools: agent.tools ?? [],
    skills: agent.skills ?? [],
    instructions: agent.instructions ?? [],
    positions: agent.positions ?? {},
  };
}

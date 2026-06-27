import { TOOL_ORDER } from '../toolMeta.jsx';

export const VALID_MODELS = [
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];

export const NAME_MAX_LENGTH = 100;
const PROMPT_MIN_LENGTH = 20;

/**
 * Validates a canonical agent definition for instant in-canvas feedback.
 * Mirrors the backend ruleset in backend/src/validation.js — error codes are
 * identical so the same codes can drive UI display on both sides.
 *
 * @param {object} agent
 * @param {object} [opts]
 * @param {string[]} [opts.existingNames]       - peer agents' names for duplicate check
 * @param {string[]} [opts.resolvableSkillIds]  - skill IDs known to exist
 * @param {string[]} [opts.availablePersonaIds] - persona IDs known to exist
 * @param {string[]} [opts.catalogIds]          - known tool IDs; defaults to full visual catalog
 * @returns {{ errors: Array<{code,field,message}>, warnings: Array<{code,field,message}> }}
 */
export function validateAgentDefinition(agent, {
  existingNames = [],
  resolvableSkillIds = [],
  availablePersonaIds = [],
  catalogIds = TOOL_ORDER,
} = {}) {
  const errors = [];
  const warnings = [];

  const name         = typeof agent?.name         === 'string' ? agent.name         : '';
  const systemPrompt = typeof agent?.systemPrompt === 'string' ? agent.systemPrompt : '';
  const persona      = typeof agent?.persona      === 'string' ? agent.persona      : '';
  const model        = typeof agent?.model        === 'string' ? agent.model        : '';
  const tools        = Array.isArray(agent?.tools)        ? agent.tools        : [];
  const skills       = Array.isArray(agent?.skills)       ? agent.skills       : [];
  const instructions = Array.isArray(agent?.instructions) ? agent.instructions : [];

  // ── Errors ────────────────────────────────────────────────────────────────

  if (!name.trim()) {
    errors.push({ code: 'NAME_EMPTY', field: 'name', message: 'Agent name is required.' });
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.push({ code: 'NAME_TOO_LONG', field: 'name', message: `Agent name must be ${NAME_MAX_LENGTH} characters or fewer.` });
  }

  if (!systemPrompt.trim() && !persona.trim() && skills.length === 0) {
    errors.push({ code: 'AGENT_DOES_NOTHING', field: null, message: 'Agent has no system prompt, persona, or skills — it will not do anything useful.' });
  }

  if (model && !VALID_MODELS.includes(model)) {
    errors.push({ code: 'INVALID_MODEL', field: 'model', message: `"${model}" is not a recognised model ID.` });
  }

  for (const toolId of tools) {
    if (!catalogIds.includes(toolId)) {
      errors.push({ code: 'UNKNOWN_TOOL', field: 'tools', message: `Tool "${toolId}" is not in the catalog.` });
    }
  }

  // ── Warnings ──────────────────────────────────────────────────────────────

  const trimmedName = name.trim().toLowerCase();
  if (trimmedName && existingNames.some((n) => typeof n === 'string' && n.trim().toLowerCase() === trimmedName)) {
    warnings.push({ code: 'DUPLICATE_NAME', field: 'name', message: `Another agent is already named "${name.trim()}".` });
  }

  for (const toolId of tools) {
    if (catalogIds.includes(toolId) && !systemPrompt.includes(toolId)) {
      warnings.push({ code: 'UNUSED_TOOL', field: 'tools', message: `Tool "${toolId}" is on the canvas but not referenced in the system prompt.` });
    }
  }

  if (resolvableSkillIds.length > 0) {
    for (const skillId of skills) {
      if (typeof skillId === 'string' && !resolvableSkillIds.includes(skillId)) {
        warnings.push({ code: 'UNRESOLVABLE_SKILL', field: 'skills', message: `Skill "${skillId}" could not be found.` });
      }
    }
  }

  if (availablePersonaIds.length > 0) {
    for (const personaId of instructions) {
      if (typeof personaId === 'string' && !availablePersonaIds.includes(personaId)) {
        warnings.push({ code: 'DELETED_PERSONA', field: 'persona', message: `Persona instruction "${personaId}" references a deleted persona.` });
      }
    }
  }

  if (systemPrompt.trim() && systemPrompt.trim().length < PROMPT_MIN_LENGTH) {
    warnings.push({ code: 'SHORT_PROMPT', field: 'systemPrompt', message: `System prompt is very short (under ${PROMPT_MIN_LENGTH} characters) — consider adding more detail.` });
  }

  return { errors, warnings };
}

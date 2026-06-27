import { describe, it, expect } from 'vitest';
import { validateAgentDefinition, VALID_MODELS, NAME_MAX_LENGTH } from '../src/serialization/agentValidation.js';
import { TOOL_ORDER } from '../src/toolMeta.jsx';

const CATALOG = TOOL_ORDER;
const VALID_TOOL = TOOL_ORDER[0]; // first tool in the visual catalog

function baseAgent(overrides = {}) {
  return {
    name: 'My Agent',
    systemPrompt: 'You are a helpful assistant.',
    persona: '',
    model: 'claude-sonnet-4-6',
    tools: [],
    skills: [],
    instructions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe('validateAgentDefinition (frontend) — errors', () => {
  it('returns empty errors and warnings for a valid agent', () => {
    const { errors, warnings } = validateAgentDefinition(baseAgent());
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  // NAME_EMPTY
  it('NAME_EMPTY: rejects empty name', () => {
    const { errors } = validateAgentDefinition(baseAgent({ name: '' }));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'NAME_EMPTY', field: 'name' }));
  });

  it('NAME_EMPTY: rejects whitespace-only name', () => {
    const { errors } = validateAgentDefinition(baseAgent({ name: '   ' }));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'NAME_EMPTY' }));
  });

  // NAME_TOO_LONG
  it('NAME_TOO_LONG: rejects name exceeding max length', () => {
    const { errors } = validateAgentDefinition(baseAgent({ name: 'a'.repeat(NAME_MAX_LENGTH + 1) }));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'NAME_TOO_LONG', field: 'name' }));
  });

  it('NAME_TOO_LONG: accepts name exactly at max length', () => {
    const { errors } = validateAgentDefinition(baseAgent({ name: 'a'.repeat(NAME_MAX_LENGTH) }));
    expect(errors.map((e) => e.code)).not.toContain('NAME_TOO_LONG');
  });

  // AGENT_DOES_NOTHING
  it('AGENT_DOES_NOTHING: fires when no prompt, no persona, no skills', () => {
    const { errors } = validateAgentDefinition(baseAgent({ systemPrompt: '', persona: '', skills: [] }));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'AGENT_DOES_NOTHING', field: null }));
  });

  it('AGENT_DOES_NOTHING: cleared when system prompt is present', () => {
    const { errors } = validateAgentDefinition(baseAgent({ systemPrompt: 'Do something.', persona: '', skills: [] }));
    expect(errors.map((e) => e.code)).not.toContain('AGENT_DOES_NOTHING');
  });

  it('AGENT_DOES_NOTHING: cleared when persona is present', () => {
    const { errors } = validateAgentDefinition(baseAgent({ systemPrompt: '', persona: 'A helpful bot.', skills: [] }));
    expect(errors.map((e) => e.code)).not.toContain('AGENT_DOES_NOTHING');
  });

  it('AGENT_DOES_NOTHING: cleared when skills are present', () => {
    const { errors } = validateAgentDefinition(baseAgent({ systemPrompt: '', persona: '', skills: ['skill-uuid-1'] }));
    expect(errors.map((e) => e.code)).not.toContain('AGENT_DOES_NOTHING');
  });

  // INVALID_MODEL
  it('INVALID_MODEL: rejects an unrecognised model id', () => {
    const { errors } = validateAgentDefinition(baseAgent({ model: 'gpt-4o' }));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'INVALID_MODEL', field: 'model' }));
  });

  it('INVALID_MODEL: accepts every entry in VALID_MODELS', () => {
    for (const model of VALID_MODELS) {
      const { errors } = validateAgentDefinition(baseAgent({ model }));
      expect(errors.map((e) => e.code)).not.toContain('INVALID_MODEL');
    }
  });

  it('INVALID_MODEL: empty model is not an error', () => {
    const { errors } = validateAgentDefinition(baseAgent({ model: '' }));
    expect(errors.map((e) => e.code)).not.toContain('INVALID_MODEL');
  });

  // UNKNOWN_TOOL
  it('UNKNOWN_TOOL: rejects a tool not in the visual catalog', () => {
    const { errors } = validateAgentDefinition(baseAgent({ tools: ['ghost_tool'] }), { catalogIds: CATALOG });
    expect(errors).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_TOOL', field: 'tools' }));
  });

  it('UNKNOWN_TOOL: reports each bad tool id separately', () => {
    const { errors } = validateAgentDefinition(baseAgent({ tools: ['bad_a', 'bad_b'] }), { catalogIds: CATALOG });
    expect(errors.filter((e) => e.code === 'UNKNOWN_TOOL')).toHaveLength(2);
  });

  it('UNKNOWN_TOOL: does not fire for a known visual tool', () => {
    const { errors } = validateAgentDefinition(
      baseAgent({ tools: [VALID_TOOL], systemPrompt: `use ${VALID_TOOL}` }),
      { catalogIds: CATALOG },
    );
    expect(errors.map((e) => e.code)).not.toContain('UNKNOWN_TOOL');
  });
});

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

describe('validateAgentDefinition (frontend) — warnings', () => {
  // DUPLICATE_NAME
  it('DUPLICATE_NAME: warns when name matches an existing agent (case-insensitive)', () => {
    const { warnings } = validateAgentDefinition(baseAgent({ name: 'Helper Bot' }), {
      existingNames: ['helper bot'],
    });
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_NAME', field: 'name' }));
  });

  it('DUPLICATE_NAME: does not warn when no existing agent shares the name', () => {
    const { warnings } = validateAgentDefinition(baseAgent({ name: 'Unique' }), {
      existingNames: ['Other Agent'],
    });
    expect(warnings.map((w) => w.code)).not.toContain('DUPLICATE_NAME');
  });

  it('DUPLICATE_NAME: silent when existingNames is omitted', () => {
    const { warnings } = validateAgentDefinition(baseAgent());
    expect(warnings.map((w) => w.code)).not.toContain('DUPLICATE_NAME');
  });

  // UNUSED_TOOL
  it('UNUSED_TOOL: warns when a valid tool is not mentioned in system prompt', () => {
    const { warnings } = validateAgentDefinition(
      baseAgent({ tools: [VALID_TOOL], systemPrompt: 'You are helpful.' }),
      { catalogIds: CATALOG },
    );
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'UNUSED_TOOL', field: 'tools' }));
  });

  it('UNUSED_TOOL: clears when tool id appears in system prompt', () => {
    const { warnings } = validateAgentDefinition(
      baseAgent({ tools: [VALID_TOOL], systemPrompt: `Use ${VALID_TOOL} for lookups.` }),
      { catalogIds: CATALOG },
    );
    expect(warnings.map((w) => w.code)).not.toContain('UNUSED_TOOL');
  });

  it('UNUSED_TOOL: does not fire for unknown tools (already an error)', () => {
    const { warnings } = validateAgentDefinition(
      baseAgent({ tools: ['phantom_tool'] }),
      { catalogIds: CATALOG },
    );
    expect(warnings.map((w) => w.code)).not.toContain('UNUSED_TOOL');
  });

  // UNRESOLVABLE_SKILL
  it('UNRESOLVABLE_SKILL: warns when a skill id is not in the resolvable set', () => {
    const { warnings } = validateAgentDefinition(
      baseAgent({ skills: ['skill-uuid-missing'] }),
      { resolvableSkillIds: ['skill-uuid-ok'] },
    );
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'UNRESOLVABLE_SKILL', field: 'skills' }));
  });

  it('UNRESOLVABLE_SKILL: clears when skill is resolvable', () => {
    const { warnings } = validateAgentDefinition(
      baseAgent({ skills: ['skill-uuid-ok'] }),
      { resolvableSkillIds: ['skill-uuid-ok'] },
    );
    expect(warnings.map((w) => w.code)).not.toContain('UNRESOLVABLE_SKILL');
  });

  it('UNRESOLVABLE_SKILL: silent when resolvableSkillIds is omitted', () => {
    const { warnings } = validateAgentDefinition(baseAgent({ skills: ['skill-uuid-unknown'] }));
    expect(warnings.map((w) => w.code)).not.toContain('UNRESOLVABLE_SKILL');
  });

  // DELETED_PERSONA
  it('DELETED_PERSONA: warns when an instruction persona id no longer exists', () => {
    const { warnings } = validateAgentDefinition(
      baseAgent({ instructions: ['persona-deleted'] }),
      { availablePersonaIds: ['persona-alive'] },
    );
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'DELETED_PERSONA', field: 'persona' }));
  });

  it('DELETED_PERSONA: clears when persona id is available', () => {
    const { warnings } = validateAgentDefinition(
      baseAgent({ instructions: ['persona-alive'] }),
      { availablePersonaIds: ['persona-alive'] },
    );
    expect(warnings.map((w) => w.code)).not.toContain('DELETED_PERSONA');
  });

  it('DELETED_PERSONA: silent when availablePersonaIds is omitted', () => {
    const { warnings } = validateAgentDefinition(baseAgent({ instructions: ['persona-unknown'] }));
    expect(warnings.map((w) => w.code)).not.toContain('DELETED_PERSONA');
  });

  // SHORT_PROMPT
  it('SHORT_PROMPT: warns when system prompt is under 20 chars', () => {
    const { warnings } = validateAgentDefinition(baseAgent({ systemPrompt: 'Be nice.' }));
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'SHORT_PROMPT', field: 'systemPrompt' }));
  });

  it('SHORT_PROMPT: clears when system prompt is 20 chars or more', () => {
    const { warnings } = validateAgentDefinition(baseAgent({ systemPrompt: 'You are a great helper.' }));
    expect(warnings.map((w) => w.code)).not.toContain('SHORT_PROMPT');
  });

  it('SHORT_PROMPT: does not fire when system prompt is empty', () => {
    const { warnings } = validateAgentDefinition(baseAgent({ systemPrompt: '', persona: 'Helpful.' }));
    expect(warnings.map((w) => w.code)).not.toContain('SHORT_PROMPT');
  });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe('validateAgentDefinition (frontend) — result shape', () => {
  it('always returns { errors, warnings } arrays even for null input', () => {
    const result = validateAgentDefinition(null);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('each entry has code, field, and message', () => {
    const { errors } = validateAgentDefinition(baseAgent({ name: '' }));
    expect(errors[0]).toMatchObject({ code: expect.any(String), field: expect.anything(), message: expect.any(String) });
  });
});

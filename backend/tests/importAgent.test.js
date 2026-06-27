import { describe, it, expect } from 'vitest';
import { parseJson, parseMarkdown } from '../src/serialization/importAgent.js';
import { AGENT_SCHEMA_VERSION } from '../src/serialization/agentSchema.js';
import { TOOL_IDS } from '../src/tools/toolDefinitions.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function isCanonical(obj) {
  const keys = ['schemaVersion', 'name', 'persona', 'systemPrompt', 'model',
                 'tools', 'skills', 'instructions', 'positions'];
  return keys.every((k) => k in obj);
}

// ─── parseJson ──────────────────────────────────────────────────────────────

describe('parseJson()', () => {
  it('returns an agent with canonical keys on valid full input', () => {
    const input = JSON.stringify({
      schemaVersion: 1,
      name: 'Research Agent',
      persona: 'You are a researcher.',
      systemPrompt: 'Be thorough.',
      model: 'claude-sonnet-4-6',
      tools: ['web_search', 'calculator'],
      skills: ['skill-abc'],
      instructions: ['inst-xyz'],
      positions: { 'web_search': { x: 100, y: 200 } },
    });
    const result = parseJson(input);
    expect(result).not.toHaveProperty('error');
    expect(result.warnings).toEqual([]);
    expect(isCanonical(result.agent)).toBe(true);
    expect(result.agent.name).toBe('Research Agent');
    expect(result.agent.persona).toBe('You are a researcher.');
    expect(result.agent.systemPrompt).toBe('Be thorough.');
    expect(result.agent.model).toBe('claude-sonnet-4-6');
    expect(result.agent.tools).toEqual(['web_search', 'calculator']);
    expect(result.agent.skills).toEqual(['skill-abc']);
    expect(result.agent.instructions).toEqual(['inst-xyz']);
    expect(result.agent.positions).toEqual({ 'web_search': { x: 100, y: 200 } });
  });

  it('sets schemaVersion from agentSchema, not from input', () => {
    const result = parseJson(JSON.stringify({ schemaVersion: 99, name: 'X' }));
    expect(result.agent.schemaVersion).toBe(AGENT_SCHEMA_VERSION);
  });

  it('tolerates missing optional fields with no warnings', () => {
    const result = parseJson(JSON.stringify({ name: 'Minimal' }));
    expect(result).not.toHaveProperty('error');
    expect(result.agent.name).toBe('Minimal');
    expect(result.agent.persona).toBe('');
    expect(result.agent.systemPrompt).toBe('');
    expect(result.agent.tools).toEqual([]);
    expect(result.agent.skills).toEqual([]);
    expect(result.agent.instructions).toEqual([]);
    expect(result.agent.positions).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it('filters out unknown tool IDs and warns', () => {
    const input = JSON.stringify({ tools: ['web_search', 'fancy_magic_tool', 'calculator'] });
    const result = parseJson(input);
    expect(result.agent.tools).toEqual(['web_search', 'calculator']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/fancy_magic_tool/);
  });

  it('accepts all valid TOOL_IDS without warnings', () => {
    const input = JSON.stringify({ tools: TOOL_IDS });
    const result = parseJson(input);
    expect(result.agent.tools).toEqual(TOOL_IDS);
    expect(result.warnings).toEqual([]);
  });

  it('warns and skips non-string name', () => {
    const result = parseJson(JSON.stringify({ name: 42 }));
    expect(result.agent.name).toBe('');
    expect(result.warnings.some((w) => w.includes('"name"'))).toBe(true);
  });

  it('warns and skips non-array tools', () => {
    const result = parseJson(JSON.stringify({ tools: 'web_search' }));
    expect(result.agent.tools).toEqual([]);
    expect(result.warnings.some((w) => w.includes('"tools"'))).toBe(true);
  });

  it('warns and skips non-object positions', () => {
    const result = parseJson(JSON.stringify({ positions: [1, 2] }));
    expect(result.agent.positions).toEqual({});
    expect(result.warnings.some((w) => w.includes('"positions"'))).toBe(true);
  });

  it('returns { error } for invalid JSON', () => {
    const result = parseJson('not json at all {{{');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/Invalid JSON/i);
    expect(result).not.toHaveProperty('agent');
  });

  it('returns { error } for a JSON array', () => {
    const result = parseJson('[1, 2, 3]');
    expect(result).toHaveProperty('error');
    expect(result.error).toMatch(/JSON object/i);
  });

  it('returns { error } for a JSON primitive', () => {
    const result = parseJson('"just a string"');
    expect(result).toHaveProperty('error');
  });

  it('returns { error } for null JSON', () => {
    const result = parseJson('null');
    expect(result).toHaveProperty('error');
  });
});

// ─── parseMarkdown ───────────────────────────────────────────────────────────

// Minimal Markdown produced by AgentForge's generateMarkdown()
function makeMarkdown({
  name = 'Test Agent',
  persona = '',
  systemPrompt = 'Do the thing.',
  tools = ['web_search', 'calculator'],
  skills = false,
  instructions = false,
  date = 'June 27, 2026',
} = {}) {
  const toolLines = tools.length
    ? tools.map((id) => {
        const labels = { web_search: 'Web Search', calculator: 'Calculator',
                         code_runner: 'Code Runner', http_request: 'API Request' };
        const l = labels[id] || id;
        return `- **${l}** — blurb`;
      }).join('\n')
    : '_No tools added._';

  const skillSection = skills
    ? `\n## Active Skills\n\n- **Skill A** — does stuff\n  > the instruction\n`
    : '';

  const instrSection = instructions
    ? `\n## Agent Instructions\n\n### My Rule\n\nDo not do bad things.\n`
    : '';

  return (
    `# ${name}\n` +
    `\n` +
    (persona ? `> ${persona}\n` : '') +
    `## System Prompt\n` +
    `\n` +
    `${systemPrompt || '_No system prompt defined._'}\n` +
    skillSection +
    instrSection +
    `\n## Capabilities\n` +
    `\n` +
    `${toolLines}\n` +
    `\n` +
    `---\n` +
    `_Created with AgentForge · ${date}_\n`
  );
}

describe('parseMarkdown()', () => {
  it('extracts name from H1', () => {
    const result = parseMarkdown(makeMarkdown({ name: 'My Bot' }));
    expect(result).not.toHaveProperty('error');
    expect(result.agent.name).toBe('My Bot');
  });

  it('extracts persona from blockquote before System Prompt', () => {
    const result = parseMarkdown(makeMarkdown({ persona: 'You are helpful.' }));
    expect(result.agent.persona).toBe('You are helpful.');
  });

  it('leaves persona empty when no blockquote present', () => {
    const result = parseMarkdown(makeMarkdown({ persona: '' }));
    expect(result.agent.persona).toBe('');
  });

  it('extracts systemPrompt text', () => {
    const result = parseMarkdown(makeMarkdown({ systemPrompt: 'Answer concisely.' }));
    expect(result.agent.systemPrompt).toBe('Answer concisely.');
  });

  it('leaves systemPrompt empty for placeholder', () => {
    const result = parseMarkdown(makeMarkdown({ systemPrompt: '' }));
    expect(result.agent.systemPrompt).toBe('');
  });

  it('maps tool labels to valid TOOL_IDs', () => {
    const result = parseMarkdown(makeMarkdown({ tools: ['web_search', 'calculator', 'code_runner', 'http_request'] }));
    expect(result.agent.tools).toEqual(['web_search', 'calculator', 'code_runner', 'http_request']);
    expect(result.warnings.filter((w) => w.includes('tool'))).toHaveLength(0);
  });

  it('warns on unknown tool label and skips it', () => {
    const md = makeMarkdown({ tools: [] }).replace(
      '_No tools added._',
      '- **Teleporter** — beam me up'
    );
    const result = parseMarkdown(md);
    expect(result.agent.tools).toEqual([]);
    expect(result.warnings.some((w) => w.includes('Teleporter'))).toBe(true);
  });

  it('handles _No tools added_ placeholder without warnings about tools', () => {
    const result = parseMarkdown(makeMarkdown({ tools: [] }));
    expect(result.agent.tools).toEqual([]);
    expect(result.warnings.filter((w) => w.toLowerCase().includes('tool label'))).toHaveLength(0);
  });

  it('warns when Skills section is present (IDs not recoverable)', () => {
    const result = parseMarkdown(makeMarkdown({ skills: true }));
    expect(result.agent.skills).toEqual([]);
    expect(result.warnings.some((w) => w.includes('Skills'))).toBe(true);
  });

  it('warns when Agent Instructions section is present (IDs not recoverable)', () => {
    const result = parseMarkdown(makeMarkdown({ instructions: true }));
    expect(result.agent.instructions).toEqual([]);
    expect(result.warnings.some((w) => w.includes('Instructions'))).toBe(true);
  });

  it('warns when System Prompt section is missing', () => {
    const md = '# Bot\n\n## Capabilities\n\n_No tools added._\n';
    const result = parseMarkdown(md);
    expect(result.warnings.some((w) => w.includes('System Prompt'))).toBe(true);
    expect(result.agent.systemPrompt).toBe('');
  });

  it('warns when Capabilities section is missing', () => {
    const md = '# Bot\n\n## System Prompt\n\nHello.\n';
    const result = parseMarkdown(md);
    expect(result.warnings.some((w) => w.includes('Capabilities'))).toBe(true);
    expect(result.agent.tools).toEqual([]);
  });

  it('warns when no H1 heading is found', () => {
    const md = '## System Prompt\n\nHello.\n\n## Capabilities\n\n_No tools added._\n';
    const result = parseMarkdown(md);
    expect(result.agent.name).toBe('');
    expect(result.warnings.some((w) => w.includes('H1'))).toBe(true);
  });

  it('always returns empty positions (cannot be recovered from Markdown)', () => {
    const result = parseMarkdown(makeMarkdown());
    expect(result.agent.positions).toEqual({});
  });

  it('always returns empty model (not present in Markdown export)', () => {
    const result = parseMarkdown(makeMarkdown());
    expect(result.agent.model).toBe('');
  });

  it('returns { error } for empty string', () => {
    const result = parseMarkdown('');
    expect(result).toHaveProperty('error');
    expect(result).not.toHaveProperty('agent');
  });

  it('returns { error } for whitespace-only input', () => {
    const result = parseMarkdown('   \n\n  ');
    expect(result).toHaveProperty('error');
  });

  it('returns { error } for non-string input', () => {
    const result = parseMarkdown(null);
    expect(result).toHaveProperty('error');
  });

  it('round-trips: full Markdown export re-imports to equivalent canonical object', () => {
    const md = makeMarkdown({
      name: 'Round Trip Bot',
      persona: 'You are precise.',
      systemPrompt: 'Always cite your sources.',
      tools: ['web_search', 'calculator'],
    });

    const result = parseMarkdown(md);
    expect(result).not.toHaveProperty('error');
    expect(result.agent.name).toBe('Round Trip Bot');
    expect(result.agent.persona).toBe('You are precise.');
    expect(result.agent.systemPrompt).toBe('Always cite your sources.');
    expect(result.agent.tools).toEqual(['web_search', 'calculator']);
    expect(result.agent.skills).toEqual([]);
    expect(result.agent.instructions).toEqual([]);
    expect(result.agent.schemaVersion).toBe(AGENT_SCHEMA_VERSION);
    expect(isCanonical(result.agent)).toBe(true);
  });
});

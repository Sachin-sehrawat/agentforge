import { describe, it, expect } from 'vitest';
import { toAnthropicPayload } from '../src/export/toAnthropic.js';
import { toCanonical } from '../src/serialization/agentSchema.js';

function makeRow(overrides = {}) {
  return {
    name: 'Test Agent',
    persona: '',
    system_prompt: '',
    model: 'claude-sonnet-4-6',
    tools: [],
    skills: [],
    instructions: [],
    tags: [],
    positions: {},
    ...overrides,
  };
}

describe('toAnthropicPayload()', () => {
  it('returns valid payload shape for empty agent', () => {
    const payload = toAnthropicPayload(toCanonical(makeRow()));
    expect(payload).toMatchObject({
      model: 'claude-sonnet-4-6',
      system: '',
      messages: [{ role: 'user', content: '' }],
      max_tokens: 4096,
      tools: [],
    });
  });

  it('output keys are always in stable order', () => {
    const payload = toAnthropicPayload(toCanonical(makeRow({ tools: ['web_search'] })));
    expect(Object.keys(payload)).toEqual(['model', 'system', 'messages', 'max_tokens', 'tools']);
  });

  it('is deterministic — identical input produces identical JSON', () => {
    const canonical = toCanonical(makeRow({
      persona: 'Researcher',
      system_prompt: 'Be thorough.',
      tools: ['web_search', 'calculator'],
      skills: ['show_reasoning'],
    }));
    expect(JSON.stringify(toAnthropicPayload(canonical))).toBe(
      JSON.stringify(toAnthropicPayload(canonical))
    );
  });

  it('falls back to default model when model is empty', () => {
    const payload = toAnthropicPayload(toCanonical(makeRow({ model: '' })));
    expect(payload.model).toBe('claude-sonnet-4-6');
  });

  it('respects model field from canonical agent', () => {
    const payload = toAnthropicPayload(toCanonical(makeRow({ model: 'claude-opus-4-8' })));
    expect(payload.model).toBe('claude-opus-4-8');
  });

  it('respects maxTokens override', () => {
    const payload = toAnthropicPayload(toCanonical(makeRow()), { maxTokens: 8192 });
    expect(payload.max_tokens).toBe(8192);
  });

  // ── System prompt composition ─────────────────────────────────────────────

  it('composes system prompt in order: persona → systemPrompt → skill instructions', () => {
    const canonical = toCanonical(makeRow({
      persona: 'You are a helpful assistant.',
      system_prompt: 'Be concise.',
      skills: ['formal_mode'],
    }));
    const { system } = toAnthropicPayload(canonical);

    expect(system).toContain('You are a helpful assistant.');
    expect(system).toContain('Be concise.');
    expect(system).toContain('formal, professional');

    const personaIdx = system.indexOf('You are a helpful assistant.');
    const promptIdx  = system.indexOf('Be concise.');
    const skillIdx   = system.indexOf('formal, professional');
    expect(personaIdx).toBeLessThan(promptIdx);
    expect(promptIdx).toBeLessThan(skillIdx);
  });

  it('omits empty sections — only persona present yields just the persona text', () => {
    const payload = toAnthropicPayload(toCanonical(makeRow({ persona: 'Only this.', system_prompt: '' })));
    expect(payload.system).toBe('Only this.');
  });

  it('multiple skills are all appended to the system prompt', () => {
    const canonical = toCanonical(makeRow({ skills: ['caveman', 'bullets_only'] }));
    const { system } = toAnthropicPayload(canonical);
    expect(system).toContain('caveman-style speech');
    expect(system).toContain('bullet point lists');
  });

  it('unknown skill IDs are silently ignored', () => {
    const canonical = toCanonical(makeRow({ skills: ['no_such_skill', 'concise'] }));
    const { system } = toAnthropicPayload(canonical);
    expect(system).not.toContain('no_such_skill');
    expect(system).toContain('3 sentences');
  });

  // ── Tool mapping ──────────────────────────────────────────────────────────

  it('maps all 4 catalog tools to correct Anthropic API shapes', () => {
    const canonical = toCanonical(makeRow({
      tools: ['web_search', 'calculator', 'code_runner', 'http_request'],
    }));
    const { tools } = toAnthropicPayload(canonical);

    expect(tools).toHaveLength(4);

    const webSearch = tools.find((t) => t.name === 'web_search');
    expect(webSearch).toEqual({ type: 'web_search_20250305', name: 'web_search' });

    const calculator = tools.find((t) => t.name === 'calculator');
    expect(calculator).toHaveProperty('description');
    expect(calculator.input_schema.required).toContain('expression');

    const codeRunner = tools.find((t) => t.name === 'code_runner');
    expect(codeRunner.input_schema.properties).toHaveProperty('code');

    const httpRequest = tools.find((t) => t.name === 'http_request');
    expect(httpRequest.input_schema.properties).toHaveProperty('url');
    expect(httpRequest.input_schema.required).toContain('url');
  });

  it('skips unknown tool IDs without throwing', () => {
    const canonical = toCanonical(makeRow({ tools: ['unknown_tool', 'web_search'] }));
    const { tools } = toAnthropicPayload(canonical);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('web_search');
  });

  it('web_search is a server tool — no input_schema or description', () => {
    const canonical = toCanonical(makeRow({ tools: ['web_search'] }));
    const { tools } = toAnthropicPayload(canonical);
    expect(tools[0]).not.toHaveProperty('input_schema');
    expect(tools[0]).not.toHaveProperty('description');
    expect(tools[0].type).toBe('web_search_20250305');
  });

  it('custom tools (calculator, code_runner, http_request) include input_schema', () => {
    const canonical = toCanonical(makeRow({ tools: ['calculator', 'code_runner', 'http_request'] }));
    const { tools } = toAnthropicPayload(canonical);
    for (const tool of tools) {
      expect(tool).toHaveProperty('input_schema');
      expect(tool.input_schema.type).toBe('object');
    }
  });
});

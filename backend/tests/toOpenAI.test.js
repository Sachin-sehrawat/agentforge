import { describe, it, expect } from 'vitest';
import { toOpenAIPayload } from '../src/export/toOpenAI.js';
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

describe('toOpenAIPayload()', () => {
  it('returns valid payload shape for empty agent (no modelOverride)', () => {
    const { payload, warnings } = toOpenAIPayload(toCanonical(makeRow()));
    expect(payload).toMatchObject({
      model: '__MODEL_REQUIRED__',
      messages: [{ role: 'system', content: '' }],
      tools: [],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/modelOverride/i);
  });

  it('output keys are always in stable order', () => {
    const { payload } = toOpenAIPayload(toCanonical(makeRow()), { modelOverride: 'gpt-4o' });
    expect(Object.keys(payload)).toEqual(['model', 'messages', 'tools']);
  });

  it('is deterministic — identical input produces identical JSON', () => {
    const canonical = toCanonical(makeRow({
      persona: 'Researcher',
      system_prompt: 'Be thorough.',
      tools: ['web_search', 'calculator'],
      skills: ['show_reasoning'],
    }));
    const a = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    const b = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  // ── Model handling ─────────────────────────────────────────────────────────

  it('emits __MODEL_REQUIRED__ placeholder when no modelOverride is given', () => {
    const { payload, warnings } = toOpenAIPayload(toCanonical(makeRow()));
    expect(payload.model).toBe('__MODEL_REQUIRED__');
    expect(warnings.some((w) => w.includes('__MODEL_REQUIRED__') || w.includes('modelOverride'))).toBe(true);
  });

  it('never forwards the Claude model ID to the payload', () => {
    const { payload } = toOpenAIPayload(toCanonical(makeRow({ model: 'claude-opus-4-8' })));
    expect(payload.model).toBe('__MODEL_REQUIRED__');
    expect(payload.model).not.toContain('claude');
  });

  it('uses modelOverride when provided and emits no model warning', () => {
    const { payload, warnings } = toOpenAIPayload(
      toCanonical(makeRow()),
      { modelOverride: 'gpt-4o' }
    );
    expect(payload.model).toBe('gpt-4o');
    expect(warnings.every((w) => !w.toLowerCase().includes('model'))).toBe(true);
  });

  // ── System prompt composition ─────────────────────────────────────────────

  it('composes system prompt in order: persona → systemPrompt → skill instructions', () => {
    const canonical = toCanonical(makeRow({
      persona: 'You are a helpful assistant.',
      system_prompt: 'Be concise.',
      skills: ['formal_mode'],
    }));
    const { payload } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    const content = payload.messages[0].content;

    expect(content).toContain('You are a helpful assistant.');
    expect(content).toContain('Be concise.');
    expect(content).toContain('formal, professional');

    const personaIdx = content.indexOf('You are a helpful assistant.');
    const promptIdx  = content.indexOf('Be concise.');
    const skillIdx   = content.indexOf('formal, professional');
    expect(personaIdx).toBeLessThan(promptIdx);
    expect(promptIdx).toBeLessThan(skillIdx);
  });

  it('omits empty sections — only persona present yields just the persona text', () => {
    const { payload } = toOpenAIPayload(
      toCanonical(makeRow({ persona: 'Only this.', system_prompt: '' })),
      { modelOverride: 'gpt-4o' }
    );
    expect(payload.messages[0].content).toBe('Only this.');
  });

  it('multiple skills are all appended to the system prompt', () => {
    const canonical = toCanonical(makeRow({ skills: ['caveman', 'bullets_only'] }));
    const { payload } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    const content = payload.messages[0].content;
    expect(content).toContain('caveman-style speech');
    expect(content).toContain('bullet point lists');
  });

  it('unknown skill IDs are silently ignored', () => {
    const canonical = toCanonical(makeRow({ skills: ['no_such_skill', 'concise'] }));
    const { payload } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    const content = payload.messages[0].content;
    expect(content).not.toContain('no_such_skill');
    expect(content).toContain('3 sentences');
  });

  // ── Tool mapping ──────────────────────────────────────────────────────────

  it('maps all 4 catalog tools to OpenAI function shapes', () => {
    const canonical = toCanonical(makeRow({
      tools: ['web_search', 'calculator', 'code_runner', 'http_request'],
    }));
    const { payload } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    const { tools } = payload;

    expect(tools).toHaveLength(4);
    for (const tool of tools) {
      expect(tool.type).toBe('function');
      expect(tool.function).toHaveProperty('name');
      expect(tool.function).toHaveProperty('description');
      expect(tool.function).toHaveProperty('parameters');
      expect(tool.function.parameters.type).toBe('object');
    }
  });

  it('web_search is emitted as a function stub with a warning', () => {
    const canonical = toCanonical(makeRow({ tools: ['web_search'] }));
    const { payload, warnings } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });

    const webSearch = payload.tools.find((t) => t.function.name === 'web_search');
    expect(webSearch).toBeDefined();
    expect(webSearch.type).toBe('function');
    expect(webSearch.function.description).toMatch(/stub/i);
    expect(webSearch.function.parameters.required).toContain('query');

    expect(warnings.some((w) => w.includes('web_search'))).toBe(true);
    expect(warnings.some((w) => /stub|implement/i.test(w))).toBe(true);
  });

  it('client tools (calculator, code_runner, http_request) emit no warnings', () => {
    const canonical = toCanonical(makeRow({ tools: ['calculator', 'code_runner', 'http_request'] }));
    const { warnings } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    expect(warnings).toHaveLength(0);
  });

  it('calculator tool has correct parameters shape', () => {
    const canonical = toCanonical(makeRow({ tools: ['calculator'] }));
    const { payload } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    const calc = payload.tools[0];
    expect(calc.function.parameters.required).toContain('expression');
    expect(calc.function.parameters.properties).toHaveProperty('expression');
  });

  it('http_request tool has correct parameters shape', () => {
    const canonical = toCanonical(makeRow({ tools: ['http_request'] }));
    const { payload } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    const http = payload.tools[0];
    expect(http.function.parameters.required).toContain('url');
    expect(http.function.parameters.properties).toHaveProperty('url');
  });

  it('skips unknown tool IDs without throwing', () => {
    const canonical = toCanonical(makeRow({ tools: ['unknown_tool', 'calculator'] }));
    const { payload } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });
    expect(payload.tools).toHaveLength(1);
    expect(payload.tools[0].function.name).toBe('calculator');
  });

  it('all-tools case: web_search stub + warning, client tools clean', () => {
    const canonical = toCanonical(makeRow({
      tools: ['web_search', 'calculator', 'code_runner', 'http_request'],
    }));
    const { payload, warnings } = toOpenAIPayload(canonical, { modelOverride: 'gpt-4o' });

    expect(payload.tools).toHaveLength(4);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('web_search');
  });

  it('returns empty warnings array when modelOverride given and no stub tools used', () => {
    const { warnings } = toOpenAIPayload(
      toCanonical(makeRow({ tools: ['calculator'] })),
      { modelOverride: 'gpt-4o' }
    );
    expect(warnings).toEqual([]);
  });
});

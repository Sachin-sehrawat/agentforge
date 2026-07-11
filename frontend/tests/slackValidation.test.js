import { describe, it, expect } from 'vitest';
import { validateForSlack } from '../src/export/slackValidation.js';
import { SLACK_PROFILE } from '../src/data/slackProfile.js';

function makeAgent(overrides = {}) {
  return {
    name: 'Slack Agent',
    systemPrompt: 'You are a helpful Slack assistant.',
    persona: '',
    model: 'claude-sonnet-4-6',
    tools: [],
    skills: [],
    instructions: [],
    ...overrides,
  };
}

// ── Profile shape ──────────────────────────────────────────────────────────────

describe('SLACK_PROFILE', () => {
  it('has required fields', () => {
    expect(SLACK_PROFILE).toHaveProperty('label', 'Slack Bot');
    expect(SLACK_PROFILE).toHaveProperty('recommendedTools');
    expect(SLACK_PROFILE).toHaveProperty('systemPromptAddendum');
    expect(SLACK_PROFILE).toHaveProperty('maxResponseGuidance');
  });

  it('recommendedTools is a non-empty array of strings', () => {
    expect(Array.isArray(SLACK_PROFILE.recommendedTools)).toBe(true);
    expect(SLACK_PROFILE.recommendedTools.length).toBeGreaterThan(0);
    for (const id of SLACK_PROFILE.recommendedTools) {
      expect(typeof id).toBe('string');
    }
  });

  it('includes web_search and calculator as recommended tools', () => {
    expect(SLACK_PROFILE.recommendedTools).toContain('web_search');
    expect(SLACK_PROFILE.recommendedTools).toContain('calculator');
  });

  it('does not include code_runner as a recommended tool', () => {
    expect(SLACK_PROFILE.recommendedTools).not.toContain('code_runner');
  });

  it('systemPromptAddendum mentions mrkdwn formatting', () => {
    expect(SLACK_PROFILE.systemPromptAddendum).toMatch(/mrkdwn/i);
  });

  it('maxResponseGuidance encourages brevity', () => {
    expect(SLACK_PROFILE.maxResponseGuidance).toMatch(/concise|brief|short|200 words/i);
  });
});

// ── validateForSlack ───────────────────────────────────────────────────────────

describe('validateForSlack()', () => {
  it('returns no warnings for a clean Slack-ready agent', () => {
    const { warnings } = validateForSlack(makeAgent());
    expect(warnings).toHaveLength(0);
  });

  it('returns { warnings } array always', () => {
    const result = validateForSlack(makeAgent());
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  // ── SLACK_NO_SYSTEM_PROMPT ──────────────────────────────────────────────────

  it('SLACK_NO_SYSTEM_PROMPT: warns when system prompt is absent', () => {
    const { warnings } = validateForSlack(makeAgent({ systemPrompt: '' }));
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_NO_SYSTEM_PROMPT', field: 'systemPrompt' })
    );
  });

  it('SLACK_NO_SYSTEM_PROMPT: warns when system prompt is whitespace only', () => {
    const { warnings } = validateForSlack(makeAgent({ systemPrompt: '   ' }));
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_NO_SYSTEM_PROMPT' })
    );
  });

  it('SLACK_NO_SYSTEM_PROMPT: no warning when system prompt is present', () => {
    const { warnings } = validateForSlack(makeAgent({ systemPrompt: 'You are a Slack bot.' }));
    expect(warnings.some((w) => w.code === 'SLACK_NO_SYSTEM_PROMPT')).toBe(false);
  });

  // ── SLACK_UNSUITABLE_TOOL ──────────────────────────────────────────────────

  it('SLACK_UNSUITABLE_TOOL: warns for code_runner', () => {
    const { warnings } = validateForSlack(makeAgent({ tools: ['code_runner'] }));
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_UNSUITABLE_TOOL', field: 'tools' })
    );
    expect(warnings.find((w) => w.code === 'SLACK_UNSUITABLE_TOOL').message).toContain('code_runner');
  });

  it('SLACK_UNSUITABLE_TOOL: warns for http_request', () => {
    const { warnings } = validateForSlack(makeAgent({ tools: ['http_request'] }));
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_UNSUITABLE_TOOL' })
    );
    expect(warnings.find((w) => w.code === 'SLACK_UNSUITABLE_TOOL').message).toContain('http_request');
  });

  it('SLACK_UNSUITABLE_TOOL: one warning per unsuitable tool', () => {
    const { warnings } = validateForSlack(makeAgent({ tools: ['code_runner', 'http_request'] }));
    const unsuitable = warnings.filter((w) => w.code === 'SLACK_UNSUITABLE_TOOL');
    expect(unsuitable).toHaveLength(2);
  });

  it('SLACK_UNSUITABLE_TOOL: no warning for recommended tools', () => {
    const { warnings } = validateForSlack(makeAgent({ tools: ['web_search', 'calculator'] }));
    expect(warnings.some((w) => w.code === 'SLACK_UNSUITABLE_TOOL')).toBe(false);
  });

  it('SLACK_UNSUITABLE_TOOL: mixed tools — only unsuitable ones warn', () => {
    const { warnings } = validateForSlack(makeAgent({ tools: ['web_search', 'code_runner'] }));
    const unsuitable = warnings.filter((w) => w.code === 'SLACK_UNSUITABLE_TOOL');
    expect(unsuitable).toHaveLength(1);
    expect(unsuitable[0].message).toContain('code_runner');
  });

  // ── SLACK_HEAVY_MARKDOWN_PROMPT ────────────────────────────────────────────

  it('SLACK_HEAVY_MARKDOWN_PROMPT: warns when prompt mentions tables', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: 'Always format data as a table.' })
    );
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_HEAVY_MARKDOWN_PROMPT', field: 'systemPrompt' })
    );
  });

  it('SLACK_HEAVY_MARKDOWN_PROMPT: warns when prompt mentions code blocks', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: 'Wrap all code in code blocks for clarity.' })
    );
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_HEAVY_MARKDOWN_PROMPT' })
    );
  });

  it('SLACK_HEAVY_MARKDOWN_PROMPT: warns when prompt contains triple-backtick fence', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: 'Show output like:\n```\nresult\n```' })
    );
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_HEAVY_MARKDOWN_PROMPT' })
    );
  });

  it('SLACK_HEAVY_MARKDOWN_PROMPT: warns when prompt mentions numbered list', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: 'Respond with a numbered list of steps.' })
    );
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_HEAVY_MARKDOWN_PROMPT' })
    );
  });

  it('SLACK_HEAVY_MARKDOWN_PROMPT: warns when prompt mentions bulleted list', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: 'Use a bulleted list to summarise each point.' })
    );
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'SLACK_HEAVY_MARKDOWN_PROMPT' })
    );
  });

  it('SLACK_HEAVY_MARKDOWN_PROMPT: no warning for a clean prose prompt', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: 'You are a concise assistant. Be friendly and direct.' })
    );
    expect(warnings.some((w) => w.code === 'SLACK_HEAVY_MARKDOWN_PROMPT')).toBe(false);
  });

  it('SLACK_HEAVY_MARKDOWN_PROMPT: suppressed when prompt already references Slack', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: 'Format tables as prose when posting to Slack.' })
    );
    expect(warnings.some((w) => w.code === 'SLACK_HEAVY_MARKDOWN_PROMPT')).toBe(false);
  });

  it('SLACK_HEAVY_MARKDOWN_PROMPT: suppressed when prompt references mrkdwn', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: 'Use mrkdwn formatting. Avoid code blocks.' })
    );
    expect(warnings.some((w) => w.code === 'SLACK_HEAVY_MARKDOWN_PROMPT')).toBe(false);
  });

  // ── Warning shape ──────────────────────────────────────────────────────────

  it('every warning has code, field, and message fields', () => {
    const { warnings } = validateForSlack(
      makeAgent({ systemPrompt: '', tools: ['code_runner'] })
    );
    for (const w of warnings) {
      expect(w).toHaveProperty('code');
      expect(w).toHaveProperty('field');
      expect(w).toHaveProperty('message');
      expect(typeof w.message).toBe('string');
      expect(w.message.length).toBeGreaterThan(0);
    }
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('handles null/undefined agent gracefully', () => {
    expect(() => validateForSlack(null)).not.toThrow();
    expect(() => validateForSlack(undefined)).not.toThrow();
    expect(() => validateForSlack({})).not.toThrow();
  });

  it('handles missing tools array gracefully', () => {
    const { warnings } = validateForSlack({ systemPrompt: 'Hello.' });
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('is deterministic — identical input produces identical output', () => {
    const agent = makeAgent({ tools: ['code_runner'], systemPrompt: '' });
    const a = validateForSlack(agent);
    const b = validateForSlack(agent);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

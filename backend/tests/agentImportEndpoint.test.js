/**
 * Integration tests for POST /api/agents/import.
 * pg and MongoDB are mocked; the endpoint is stateless so no DB calls happen.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';

// ---------------------------------------------------------------------------
// pg mock
// ---------------------------------------------------------------------------

const mockPoolQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPoolConnect = vi.fn(() =>
  Promise.resolve({ query: mockClientQuery, release: mockClientRelease })
);

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(function () {
      this.query = mockPoolQuery;
      this.connect = mockPoolConnect;
      this.on = vi.fn();
      this.totalCount = 0;
      this.idleCount = 0;
      this.waitingCount = 0;
    }),
  },
}));

// ---------------------------------------------------------------------------
// MongoDB mock
// ---------------------------------------------------------------------------

vi.mock('../src/mongo.js', () => ({
  connect: vi.fn(),
  getDb: vi.fn(() => ({ collection: vi.fn() })),
  healthCheck: vi.fn(async () => ({ ok: true })),
}));

// ---------------------------------------------------------------------------
// Auth mocks
// ---------------------------------------------------------------------------

vi.mock('../src/auth/crypto.js', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('../src/auth/token.js', () => ({
  signAccessToken: vi.fn(() => 'test-token'),
  verifyToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import app AFTER mocks
// ---------------------------------------------------------------------------

const { app } = await import('../src/app.js');

// ---------------------------------------------------------------------------
// HTTP server lifecycle
// ---------------------------------------------------------------------------

let server;
let baseUrl;

beforeAll(
  () =>
    new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);

afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(body) {
  return fetch(`${baseUrl}/api/agents/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_JSON_AGENT = JSON.stringify({
  name: 'Research Agent',
  persona: 'You are a researcher.',
  systemPrompt: 'Be thorough.',
  model: 'claude-sonnet-4-6',
  tools: ['web_search', 'calculator'],
  skills: ['skill-abc'],
  instructions: ['inst-xyz'],
  positions: {},
});

const VALID_MARKDOWN_AGENT =
  '# Markdown Bot\n\n' +
  '> You are helpful.\n\n' +
  '## System Prompt\n\n' +
  'Answer concisely.\n\n' +
  '## Capabilities\n\n' +
  '- **Web Search** — blurb\n\n' +
  '---\n_Created with AgentForge_\n';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agents/import', () => {
  // Happy path — JSON
  it('parses a valid JSON agent and returns draft + empty warnings', async () => {
    const res = await post({ format: 'json', content: VALID_JSON_AGENT });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('agent');
    expect(body).toHaveProperty('warnings');
    expect(body.warnings).toEqual([]);
    expect(body.agent.name).toBe('Research Agent');
    expect(body.agent.tools).toEqual(['web_search', 'calculator']);
  });

  // Happy path — Markdown
  it('parses a valid Markdown agent and returns draft', async () => {
    const res = await post({ format: 'markdown', content: VALID_MARKDOWN_AGENT });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.name).toBe('Markdown Bot');
    expect(body.agent.tools).toEqual(['web_search']);
    expect(body.agent.systemPrompt).toBe('Answer concisely.');
  });

  // Warnings surface (unknown tool in JSON)
  it('strips unknown tools and includes warnings', async () => {
    const content = JSON.stringify({ name: 'Bot', tools: ['web_search', 'magic_laser'] });
    const res = await post({ format: 'json', content });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agent.tools).toEqual(['web_search']);
    expect(body.warnings.some((w) => w.includes('magic_laser'))).toBe(true);
  });

  // Endpoint is stateless — no persistence
  it('does not call the database', async () => {
    await post({ format: 'json', content: VALID_JSON_AGENT });
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  // Error: invalid format
  it('returns 400 when format is missing', async () => {
    const res = await post({ content: VALID_JSON_AGENT });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/format/i);
  });

  it('returns 400 for an unsupported format value', async () => {
    const res = await post({ format: 'xml', content: '<agent/>' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/format/i);
  });

  // Error: content not a string
  it('returns 400 when content is not a string', async () => {
    const res = await post({ format: 'json', content: 42 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/content/i);
  });

  // Error: malformed JSON content
  it('returns 400 for malformed JSON content', async () => {
    const res = await post({ format: 'json', content: '{bad json' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/JSON/i);
  });

  // Error: empty Markdown
  it('returns 400 for empty Markdown content', async () => {
    const res = await post({ format: 'markdown', content: '' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  // Error: oversized payload
  it('returns 400 when content exceeds 256 KB', async () => {
    const content = 'x'.repeat(256 * 1024 + 1);
    const res = await post({ format: 'json', content });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/256 KB/i);
  });
});

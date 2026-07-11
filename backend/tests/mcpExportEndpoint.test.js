/**
 * Integration tests for POST /api/agents/:id/export-mcp.
 *
 * pg and MongoDB are mocked; a real HTTP server is started on a random port.
 * Tests verify: zip response, validation errors, auth rules, and quota gating.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import { unzipSync } from 'fflate';

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
      this.totalCount = 2;
      this.idleCount = 2;
      this.waitingCount = 0;
    }),
  },
}));

// ---------------------------------------------------------------------------
// MongoDB mock
// ---------------------------------------------------------------------------

vi.mock('../src/mongo.js', () => ({
  connect: vi.fn(),
  getDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      insertOne: vi.fn(),
      deleteOne: vi.fn(),
      find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
    })),
  })),
  healthCheck: vi.fn(async () => ({ ok: true })),
}));

// ---------------------------------------------------------------------------
// Auth mocks
// ---------------------------------------------------------------------------

vi.mock('../src/auth/crypto.js', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

const mockVerifyToken = vi.fn();

vi.mock('../src/auth/token.js', () => ({
  signAccessToken: vi.fn(() => 'test-token'),
  verifyToken: mockVerifyToken,
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

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyToken.mockReset();
  mockPoolQuery.mockReset();
  mockClientQuery.mockReset();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_ID   = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_USER = 'bbbbbbbb-0000-0000-0000-000000000002';
const AGENT_ID   = 'cccccccc-0000-0000-0000-000000000001';

function makeAgentRow(overrides = {}) {
  return {
    id: AGENT_ID,
    name: 'Research Agent',
    persona: 'You are a research assistant.',
    system_prompt: 'Be thorough and cite your sources.',
    model: 'claude-sonnet-4-6',
    tools: ['web_search', 'calculator'],
    positions: {},
    skills: [],
    instructions: [],
    tags: [],
    category_id: null,
    owner_id: OWNER_ID,
    visibility: 'private',
    fork_count: 0,
    favorite_count: 0,
    rating_sum: 0,
    rating_count: 0,
    forked_from: null,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

// Authenticated request helper.
// DB call order for an authenticated request (free-tier user with quota headroom):
//   1. enforceQuota: SELECT tier FROM users
//   2. enforceQuota: INSERT INTO usage_counters RETURNING count  → { count: 1 }
//   3. handler:      SELECT * FROM agents WHERE id = $1
//   4. handler:      INSERT INTO agent_events  (fire-and-forget, uses default mock)
function setupAuthedRequest(agentRow) {
  mockVerifyToken.mockReturnValueOnce({ userId: OWNER_ID });
  mockPoolQuery
    .mockResolvedValueOnce({ rows: [{ tier: 'free' }] })        // 1. enforceQuota tier
    .mockResolvedValueOnce({ rows: [{ count: 1 }] })             // 2. enforceQuota counter
    .mockResolvedValueOnce({ rows: agentRow ? [agentRow] : [] }) // 3. agent lookup
    .mockResolvedValue({ rows: [] });                            // 4+ fire-and-forget
}

// Anonymous request helper (no auth → quota middleware skips immediately).
// DB call order:
//   1. handler: SELECT * FROM agents WHERE id = $1
//   2. handler: INSERT INTO agent_events (fire-and-forget, uses default mock)
function setupAnonRequest(agentRow) {
  mockPoolQuery
    .mockResolvedValueOnce({ rows: agentRow ? [agentRow] : [] }) // 1. agent lookup
    .mockResolvedValue({ rows: [] });                            // 2+ fire-and-forget
}

async function postMcp(agentId, { token } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${baseUrl}/api/agents/${agentId}/export-mcp`, { method: 'POST', headers });
}

// ---------------------------------------------------------------------------
// Tests: happy path
// ---------------------------------------------------------------------------

describe('POST /api/agents/:id/export-mcp — success', () => {
  it('returns 200 with application/zip content-type', async () => {
    setupAuthedRequest(makeAgentRow());
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
  });

  it('returns a valid zip with all expected files', async () => {
    setupAuthedRequest(makeAgentRow());
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    const buffer = await res.arrayBuffer();
    const zip = unzipSync(new Uint8Array(buffer));
    const filenames = Object.keys(zip).sort();

    expect(filenames).toEqual([
      'Dockerfile',
      'README.md',
      'package.json',
      'server.js',
      'server.json',
      'server.py',
    ]);
  });

  it('zip contains valid JSON in package.json', async () => {
    setupAuthedRequest(makeAgentRow());
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    const buffer = await res.arrayBuffer();
    const zip = unzipSync(new Uint8Array(buffer));
    const pkgText = new TextDecoder().decode(zip['package.json']);
    const pkg = JSON.parse(pkgText);
    expect(pkg).toHaveProperty('dependencies.@modelcontextprotocol/sdk');
  });

  it('zip server.js references the agent name', async () => {
    setupAuthedRequest(makeAgentRow());
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    const buffer = await res.arrayBuffer();
    const zip = unzipSync(new Uint8Array(buffer));
    const serverJs = new TextDecoder().decode(zip['server.js']);
    expect(serverJs).toContain('Research Agent');
  });

  it('includes a Content-Disposition header with a zip filename', async () => {
    setupAuthedRequest(makeAgentRow());
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    const cd = res.headers.get('content-disposition');
    expect(cd).toMatch(/attachment/);
    expect(cd).toMatch(/\.zip/);
  });

  it('allows anonymous access to public agents', async () => {
    setupAnonRequest(makeAgentRow({ visibility: 'public' }));
    const res = await postMcp(AGENT_ID); // no token
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
  });

  it('allows the owner to export their private agent', async () => {
    setupAuthedRequest(makeAgentRow({ visibility: 'private' }));
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Tests: authorization
// ---------------------------------------------------------------------------

describe('POST /api/agents/:id/export-mcp — authorization', () => {
  it('returns 403 when a non-owner tries to export a private agent', async () => {
    mockVerifyToken.mockReturnValueOnce({ userId: OTHER_USER });
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ tier: 'free' }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [makeAgentRow({ visibility: 'private' })] })
      .mockResolvedValue({ rows: [] });

    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden/i);
  });

  it('returns 403 when unauthenticated access to a private agent', async () => {
    setupAnonRequest(makeAgentRow({ visibility: 'private' }));
    const res = await postMcp(AGENT_ID); // no token
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tests: 404
// ---------------------------------------------------------------------------

describe('POST /api/agents/:id/export-mcp — not found', () => {
  it('returns 404 when the agent does not exist', async () => {
    setupAuthedRequest(null); // null means empty agent rows
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: MCP validation (422)
// ---------------------------------------------------------------------------

describe('POST /api/agents/:id/export-mcp — validation', () => {
  it('returns 422 when the agent has no tools', async () => {
    setupAuthedRequest(makeAgentRow({ tools: [] }));
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/MCP export/i);
    expect(body.details).toEqual(
      expect.arrayContaining([expect.stringMatching(/tool/i)])
    );
  });

  it('returns 422 when the agent has no description (no persona or system_prompt)', async () => {
    setupAuthedRequest(makeAgentRow({ persona: '', system_prompt: '' }));
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.details).toEqual(
      expect.arrayContaining([expect.stringMatching(/description/i)])
    );
  });

  it('returns 422 when the agent has no name', async () => {
    setupAuthedRequest(makeAgentRow({ name: '' }));
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.details).toEqual(
      expect.arrayContaining([expect.stringMatching(/name/i)])
    );
  });

  it('collects multiple validation errors at once', async () => {
    setupAuthedRequest(makeAgentRow({ name: '', tools: [] }));
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.details.length).toBeGreaterThanOrEqual(2);
  });

  it('passes when persona is empty but system_prompt is set', async () => {
    setupAuthedRequest(makeAgentRow({ persona: '', system_prompt: 'Do research.' }));
    const res = await postMcp(AGENT_ID, { token: 'test-token' });
    expect(res.status).toBe(200);
  });
});

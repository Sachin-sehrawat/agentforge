/**
 * Integration tests for bulk agent endpoints:
 *   POST /api/agents/bulk-delete
 *   POST /api/agents/bulk-export
 *
 * pg and MongoDB are fully mocked; a real HTTP server is started on a random
 * port so every test exercises the full Express middleware stack.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';

// ---------------------------------------------------------------------------
// pg mock — must be declared before app.js is imported
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
  signRefreshToken: vi.fn(),
  verifyToken: mockVerifyToken,
}));

// ---------------------------------------------------------------------------
// Import app AFTER mocks are registered
// ---------------------------------------------------------------------------

const { app } = await import('../src/app.js');

// ---------------------------------------------------------------------------
// HTTP test server lifecycle
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
// Helpers
// ---------------------------------------------------------------------------

const OWNER_ID      = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const AGENT_ID_1    = 'cccccccc-0000-0000-0000-000000000001';
const AGENT_ID_2    = 'cccccccc-0000-0000-0000-000000000002';
const AGENT_ID_3    = 'cccccccc-0000-0000-0000-000000000003';

function makeAgentRow(id, overrides = {}) {
  return {
    id,
    name: `Agent ${id.slice(-1)}`,
    persona: 'Helpful assistant',
    system_prompt: 'Be helpful',
    model: 'claude-sonnet-4-6',
    tools: ['calculator'],
    positions: {},
    skills: [],
    instructions: [],
    tags: [],
    owner_id: OWNER_ID,
    visibility: 'private',
    fork_count: 0,
    forked_from: null,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function authedPost(path, body, userId = OWNER_ID) {
  mockVerifyToken.mockReturnValueOnce({ userId });
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// POST /api/agents/bulk-delete
// ---------------------------------------------------------------------------

describe('POST /api/agents/bulk-delete', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/agents/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [AGENT_ID_1] }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty ids array', async () => {
    const res = await authedPost('/api/agents/bulk-delete', { ids: [] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-empty/i);
  });

  it('returns 400 when ids is missing', async () => {
    const res = await authedPost('/api/agents/bulk-delete', {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-empty/i);
  });

  it('returns 400 when batch exceeds 100', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `cccccccc-0000-0000-0000-${String(i).padStart(12, '0')}`);
    const res = await authedPost('/api/agents/bulk-delete', { ids });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it('deletes owned agents and returns deleted + skipped', async () => {
    // SELECT returns only AGENT_ID_1 and AGENT_ID_2 (owned); AGENT_ID_3 is skipped
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: AGENT_ID_1 }, { id: AGENT_ID_2 }] }) // SELECT owned
      .mockResolvedValueOnce({ rowCount: 2 }) // DELETE
      .mockResolvedValueOnce({}); // COMMIT

    const res = await authedPost('/api/agents/bulk-delete', {
      ids: [AGENT_ID_1, AGENT_ID_2, AGENT_ID_3],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toEqual(expect.arrayContaining([AGENT_ID_1, AGENT_ID_2]));
    expect(body.deleted).toHaveLength(2);
    expect(body.skipped).toEqual([AGENT_ID_3]);
  });

  it('skips all ids when none are owned', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT → none owned
      .mockResolvedValueOnce({}); // COMMIT (no DELETE call)

    const res = await authedPost('/api/agents/bulk-delete', {
      ids: [AGENT_ID_1, AGENT_ID_2],
    }, OTHER_USER_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toEqual([]);
    expect(body.skipped).toEqual(expect.arrayContaining([AGENT_ID_1, AGENT_ID_2]));
  });

  it('does not issue DELETE when all ids are skipped', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT → none owned
      .mockResolvedValueOnce({}); // COMMIT

    await authedPost('/api/agents/bulk-delete', { ids: [AGENT_ID_1] }, OTHER_USER_ID);

    const deleteCalls = mockClientQuery.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && sql.toUpperCase().startsWith('DELETE')
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('passes caller id to the SELECT query', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT
      .mockResolvedValueOnce({}); // COMMIT

    await authedPost('/api/agents/bulk-delete', { ids: [AGENT_ID_1] });

    const selectCall = mockClientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.toLowerCase().includes('select')
    );
    expect(selectCall).toBeDefined();
    expect(selectCall[1]).toContain(OWNER_ID);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents/bulk-export
// ---------------------------------------------------------------------------

describe('POST /api/agents/bulk-export', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/agents/bulk-export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [AGENT_ID_1], format: 'json' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty ids array', async () => {
    const res = await authedPost('/api/agents/bulk-export', { ids: [], format: 'json' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-empty/i);
  });

  it('returns 400 when ids is missing', async () => {
    const res = await authedPost('/api/agents/bulk-export', { format: 'json' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when batch exceeds 100', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `cccccccc-0000-0000-0000-${String(i).padStart(12, '0')}`);
    const res = await authedPost('/api/agents/bulk-export', { ids, format: 'json' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it('returns 400 for invalid format', async () => {
    const res = await authedPost('/api/agents/bulk-export', { ids: [AGENT_ID_1], format: 'csv' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/format/i);
  });

  it('returns JSON content for owned agents', async () => {
    const row1 = makeAgentRow(AGENT_ID_1);
    const row2 = makeAgentRow(AGENT_ID_2);
    mockPoolQuery.mockResolvedValueOnce({ rows: [row1, row2] });

    const res = await authedPost('/api/agents/bulk-export', {
      ids: [AGENT_ID_1, AGENT_ID_2, AGENT_ID_3],
      format: 'json',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(2);

    const result1 = body.results.find((r) => r.id === AGENT_ID_1);
    expect(result1).toBeDefined();
    expect(result1.name).toBe(row1.name);

    const parsed = JSON.parse(result1.content);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.name).toBe(row1.name);
    expect(parsed.systemPrompt).toBe(row1.system_prompt);
    // id and owner_id are excluded from canonical form
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('owner_id');
  });

  it('returns Markdown content for owned agents', async () => {
    const row = makeAgentRow(AGENT_ID_1, { name: 'My Bot', system_prompt: 'Do stuff', tools: ['web_search'] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [row] });

    const res = await authedPost('/api/agents/bulk-export', {
      ids: [AGENT_ID_1],
      format: 'markdown',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);

    const { content } = body.results[0];
    expect(content).toMatch(/^# My Bot/m);
    expect(content).toMatch(/Do stuff/);
    expect(content).toMatch(/Web Search/); // tool label from TOOL_CATALOG
  });

  it('skips non-owned agents — only returns rows the DB matched', async () => {
    // DB query already filters by owner_id, so only owned rows come back
    const row = makeAgentRow(AGENT_ID_1);
    mockPoolQuery.mockResolvedValueOnce({ rows: [row] });

    const res = await authedPost('/api/agents/bulk-export', {
      ids: [AGENT_ID_1, AGENT_ID_3], // AGENT_ID_3 not owned
      format: 'json',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe(AGENT_ID_1);
  });

  it('passes caller id to the SELECT query', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await authedPost('/api/agents/bulk-export', { ids: [AGENT_ID_1], format: 'json' });

    expect(mockPoolQuery).toHaveBeenCalledOnce();
    const [, params] = mockPoolQuery.mock.calls[0];
    expect(params).toContain(OWNER_ID);
  });

  it('returns empty results when caller owns none of the ids', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await authedPost('/api/agents/bulk-export', {
      ids: [AGENT_ID_1, AGENT_ID_2],
      format: 'markdown',
    }, OTHER_USER_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });
});

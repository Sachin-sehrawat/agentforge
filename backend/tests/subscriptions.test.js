/**
 * HTTP endpoint tests for subscription routes.
 *
 * pg and mongodb are fully mocked so these run without any live database.
 * A real HTTP server is started on a random port (listen(0)) so every test
 * exercises the full Express middleware stack.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';

// ---------------------------------------------------------------------------
// pg mock — must be declared before app.js is imported
// ---------------------------------------------------------------------------

const mockPoolQuery = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(function () {
      this.query = mockPoolQuery;
      this.connect = vi.fn();
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
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'cccccccc-0000-0000-0000-000000000001';
const AGENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

function authedReq(method, path, body) {
  mockVerifyToken.mockReturnValue({ userId: USER_ID });
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-token',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${baseUrl}${path}`, opts);
}

function anonReq(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${baseUrl}${path}`, opts);
}

function subscribedAgentRow(overrides = {}) {
  return {
    id: AGENT_ID,
    name: 'Public Agent',
    persona: '',
    system_prompt: 'Help users.',
    model: 'claude-sonnet-4-6',
    tools: [],
    positions: {},
    skills: [],
    instructions: [],
    owner_id: 'dddddddd-0000-0000-0000-000000000001',
    visibility: 'public',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    subscribed_at: new Date('2024-06-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /api/subscriptions — subscribe
// ---------------------------------------------------------------------------

describe('POST /api/subscriptions', () => {
  it('returns 401 without auth', async () => {
    const res = await anonReq('POST', '/api/subscriptions', { agentId: AGENT_ID });
    expect(res.status).toBe(401);
  });

  it('returns 400 when agentId is missing', async () => {
    const res = await authedReq('POST', '/api/subscriptions', {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/agentId/);
  });

  it('returns 400 when agentId is empty string', async () => {
    const res = await authedReq('POST', '/api/subscriptions', { agentId: '  ' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with userId and agentId on success', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await authedReq('POST', '/api/subscriptions', { agentId: AGENT_ID });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.userId).toBe(USER_ID);
    expect(body.agentId).toBe(AGENT_ID);
  });

  it('returns 409 on duplicate subscription (PG 23505)', async () => {
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    mockPoolQuery.mockRejectedValueOnce(err);

    const res = await authedReq('POST', '/api/subscriptions', { agentId: AGENT_ID });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already subscribed/i);
  });

  it('returns 404 when agent does not exist (PG 23503)', async () => {
    const err = new Error('insert or update on table "subscriptions" violates foreign key constraint');
    err.code = '23503';
    mockPoolQuery.mockRejectedValueOnce(err);

    const res = await authedReq('POST', '/api/subscriptions', { agentId: 'nonexistent-id' });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/agent not found/i);
  });

  it('returns 500 on unexpected db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('connection lost'));

    const res = await authedReq('POST', '/api/subscriptions', { agentId: AGENT_ID });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/subscriptions/:agentId — unsubscribe
// ---------------------------------------------------------------------------

describe('DELETE /api/subscriptions/:agentId', () => {
  it('returns 401 without auth', async () => {
    const res = await anonReq('DELETE', `/api/subscriptions/${AGENT_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 204 when subscription is deleted', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await authedReq('DELETE', `/api/subscriptions/${AGENT_ID}`);
    expect(res.status).toBe(204);
  });

  it('returns 404 when subscription does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });

    const res = await authedReq('DELETE', `/api/subscriptions/${AGENT_ID}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/subscription not found/i);
  });

  it('returns 500 on unexpected db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));

    const res = await authedReq('DELETE', `/api/subscriptions/${AGENT_ID}`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions — list subscribed agents
// ---------------------------------------------------------------------------

describe('GET /api/subscriptions', () => {
  it('returns 401 without auth', async () => {
    const res = await anonReq('GET', '/api/subscriptions');
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty array when user has no subscriptions', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await authedReq('GET', '/api/subscriptions');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns 200 with serialized subscribed agents', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [subscribedAgentRow()] });

    const res = await authedReq('GET', '/api/subscriptions');
    expect(res.status).toBe(200);
    const agents = await res.json();
    expect(agents).toHaveLength(1);
    const a = agents[0];
    expect(a.id).toBe(AGENT_ID);
    expect(a.name).toBe('Public Agent');
    expect(a.systemPrompt).toBe('Help users.');
    expect(a.visibility).toBe('public');
    expect(a.subscribedAt).toBeDefined();
  });

  it('uses JOIN result — includes ownerId from agent row', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [subscribedAgentRow()] });

    const res = await authedReq('GET', '/api/subscriptions');
    const [a] = await res.json();
    expect(a.ownerId).toBe('dddddddd-0000-0000-0000-000000000001');
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('connection lost'));

    const res = await authedReq('GET', '/api/subscriptions');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/:agentId — check subscription existence
// ---------------------------------------------------------------------------

describe('GET /api/subscriptions/:agentId', () => {
  it('returns 401 without auth', async () => {
    const res = await anonReq('GET', `/api/subscriptions/${AGENT_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns { subscribed: true } when user is subscribed', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const res = await authedReq('GET', `/api/subscriptions/${AGENT_ID}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscribed: true });
  });

  it('returns { subscribed: false } when user is not subscribed', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await authedReq('GET', `/api/subscriptions/${AGENT_ID}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscribed: false });
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));

    const res = await authedReq('GET', `/api/subscriptions/${AGENT_ID}`);
    expect(res.status).toBe(500);
  });
});

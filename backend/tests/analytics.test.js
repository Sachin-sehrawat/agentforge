/**
 * HTTP endpoint tests for owner-only analytics routes.
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

const OWNER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const AGENT_ID = 'cccccccc-0000-0000-0000-000000000001';

function authedAs(userId) {
  mockVerifyToken.mockReturnValue({ userId });
  return { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' };
}

function req(method, path, userId = OWNER_ID) {
  return fetch(`${baseUrl}${path}`, { method, headers: authedAs(userId) });
}

function anonReq(method, path) {
  return fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' } });
}

// Canonical DB row returned for agent aggregate queries.
function agentAggregateRow(overrides = {}) {
  return {
    owner_id: OWNER_ID,
    favorite_count: 5,
    fork_count: 3,
    rating_sum: 18,
    rating_count: 5,
    subscriber_count: 7,
    export_count: 12,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /api/agents/mine/analytics-summary
// ---------------------------------------------------------------------------

describe('GET /api/agents/mine/analytics-summary', () => {
  it('returns 401 without auth', async () => {
    const res = await anonReq('GET', '/api/agents/mine/analytics-summary');
    expect(res.status).toBe(401);
  });

  it('returns empty array when owner has no agents', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await req('GET', '/api/agents/mine/analytics-summary');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns per-agent rollup with camelCase fields', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          agent_id: AGENT_ID,
          name: 'My Agent',
          favorite_count: 5,
          fork_count: 3,
          rating_sum: 18,
          rating_count: 5,
          subscriber_count: 7,
          export_count: 12,
        },
      ],
    });

    const res = await req('GET', '/api/agents/mine/analytics-summary');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    const entry = body[0];
    expect(entry.agentId).toBe(AGENT_ID);
    expect(entry.name).toBe('My Agent');
    expect(entry.subscriberCount).toBe(7);
    expect(entry.favoriteCount).toBe(5);
    expect(entry.forkCount).toBe(3);
    expect(entry.exportCount).toBe(12);
    expect(entry.avgRating).toBeCloseTo(18 / 5);
  });

  it('sets avgRating to null when ratingCount is 0', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          agent_id: AGENT_ID,
          name: 'Unrated Agent',
          favorite_count: 0,
          fork_count: 0,
          rating_sum: 0,
          rating_count: 0,
          subscriber_count: 0,
          export_count: 0,
        },
      ],
    });

    const res = await req('GET', '/api/agents/mine/analytics-summary');
    const [entry] = await res.json();
    expect(entry.avgRating).toBeNull();
  });

  it('never exposes email or password_hash fields', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          agent_id: AGENT_ID,
          name: 'Agent',
          favorite_count: 0,
          fork_count: 0,
          rating_sum: 0,
          rating_count: 0,
          subscriber_count: 0,
          export_count: 0,
          email: 'should-not-appear@example.com',
          password_hash: 'secret',
        },
      ],
    });

    const res = await req('GET', '/api/agents/mine/analytics-summary');
    const [entry] = await res.json();
    expect(entry).not.toHaveProperty('email');
    expect(entry).not.toHaveProperty('password_hash');
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));

    const res = await req('GET', '/api/agents/mine/analytics-summary');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id/analytics
// ---------------------------------------------------------------------------

describe('GET /api/agents/:id/analytics', () => {
  it('returns 401 without auth', async () => {
    const res = await anonReq('GET', `/api/agents/${AGENT_ID}/analytics`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when agent does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/agent not found/i);
  });

  it('returns 403 when caller is not the owner', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [agentAggregateRow({ owner_id: OWNER_ID })] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics`, OTHER_ID);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
  });

  it('returns 200 with summary and subscriber list for the owner', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [agentAggregateRow()] })
      .mockResolvedValueOnce({
        rows: [
          { display_name: 'Alice', subscribed_at: new Date('2024-05-01T00:00:00Z') },
          { display_name: 'Bob', subscribed_at: new Date('2024-04-01T00:00:00Z') },
        ],
      });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.subscriberCount).toBe(7);
    expect(body.favoriteCount).toBe(5);
    expect(body.forkCount).toBe(3);
    expect(body.exportCount).toBe(12);
    expect(body.ratingCount).toBe(5);
    expect(body.avgRating).toBeCloseTo(18 / 5);

    expect(body.subscribers).toHaveLength(2);
    expect(body.subscribers[0].displayName).toBe('Alice');
    expect(body.subscribers[0].subscribedAt).toBeDefined();
    expect(body.subscribers[1].displayName).toBe('Bob');
  });

  it('count reconciliation: subscriberCount matches subscriber list length', async () => {
    const subscriberRows = [
      { display_name: 'Alice', subscribed_at: new Date() },
      { display_name: 'Carol', subscribed_at: new Date() },
    ];
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [agentAggregateRow({ subscriber_count: subscriberRows.length })] })
      .mockResolvedValueOnce({ rows: subscriberRows });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics`);
    const body = await res.json();

    expect(body.subscriberCount).toBe(body.subscribers.length);
  });

  it('sets avgRating to null when ratingCount is 0', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [agentAggregateRow({ rating_sum: 0, rating_count: 0 })] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics`);
    const body = await res.json();
    expect(body.avgRating).toBeNull();
    expect(body.ratingCount).toBe(0);
  });

  it('never exposes email in subscribers array', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [agentAggregateRow()] })
      .mockResolvedValueOnce({
        rows: [{ display_name: 'Alice', subscribed_at: new Date(), email: 'alice@example.com' }],
      });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics`);
    const body = await res.json();
    for (const sub of body.subscribers) {
      expect(sub).not.toHaveProperty('email');
    }
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('connection lost'));

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id/analytics/timeline
// ---------------------------------------------------------------------------

describe('GET /api/agents/:id/analytics/timeline', () => {
  const eventRow = (overrides = {}) => ({
    id: 1,
    type: 'subscribe',
    meta: null,
    created_at: new Date('2024-06-01T00:00:00Z'),
    actor_display_name: 'Alice',
    ...overrides,
  });

  it('returns 401 without auth', async () => {
    const res = await anonReq('GET', `/api/agents/${AGENT_ID}/analytics/timeline`);
    expect(res.status).toBe(401);
  });

  it('returns 404 when agent does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics/timeline`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/agent not found/i);
  });

  it('returns 403 when caller is not the owner', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ owner_id: OWNER_ID }] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics/timeline`, OTHER_ID);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
  });

  it('returns 200 with paginated events for the owner', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: OWNER_ID }] })
      .mockResolvedValueOnce({ rows: [eventRow()] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics/timeline`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.events).toHaveLength(1);

    const e = body.events[0];
    expect(e.id).toBe(1);
    expect(e.type).toBe('subscribe');
    expect(e.actorDisplayName).toBe('Alice');
    expect(e.createdAt).toBeDefined();
  });

  it('sets actorDisplayName to null for anonymous events', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: OWNER_ID }] })
      .mockResolvedValueOnce({ rows: [eventRow({ actor_display_name: null })] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics/timeline`);
    const body = await res.json();
    expect(body.events[0].actorDisplayName).toBeNull();
  });

  it('respects limit query param (capped at 100)', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: OWNER_ID }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics/timeline?limit=200`);
    const body = await res.json();
    expect(body.limit).toBe(100);
  });

  it('returns 200 with empty events array when there are none', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: OWNER_ID }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics/timeline`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));

    const res = await req('GET', `/api/agents/${AGENT_ID}/analytics/timeline`);
    expect(res.status).toBe(500);
  });
});

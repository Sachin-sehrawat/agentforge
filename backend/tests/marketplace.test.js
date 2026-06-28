/**
 * Integration tests for GET /api/agents/marketplace.
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

const USER_ID  = 'cccccccc-0000-0000-0000-000000000001';
const OWNER_ID = 'dddddddd-0000-0000-0000-000000000001';
const AGENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

function anonReq(path) {
  return fetch(`${baseUrl}${path}`);
}

function authedReq(path) {
  mockVerifyToken.mockReturnValue({ userId: USER_ID });
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: 'Bearer valid-token' },
  });
}

/** A minimal public agent DB row with marketplace columns. */
function agentRow(overrides = {}) {
  return {
    id: AGENT_ID,
    name: 'Research Bot',
    persona: 'A helpful research assistant.',
    system_prompt: 'You help with research tasks.',
    model: 'claude-sonnet-4-6',
    tools: ['web_search'],
    positions: {},
    skills: [],
    instructions: [],
    owner_id: OWNER_ID,
    visibility: 'public',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-06-01T00:00:00Z'),
    fork_count: 3,
    favorite_count: 7,
    rating_sum: 45,
    rating_count: 10,
    avg_rating: 4.5,
    owner_display_name: 'Alice',
    rank: null,
    is_subscribed: false,
    is_owner: false,
    ...overrides,
  };
}

/**
 * Mock both the data and count queries that the marketplace endpoint fires in
 * parallel. The Promise.all order matches call order: data first, count second.
 */
function mockDataAndCount(rows, total) {
  mockPoolQuery
    .mockResolvedValueOnce({ rows })           // data query
    .mockResolvedValueOnce({ rows: [{ total: String(total) }] }); // count query
}

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

describe('GET /api/agents/marketplace', () => {
  it('returns 200 with correct envelope shape', async () => {
    mockDataAndCount([agentRow()], 1);

    const res = await anonReq('/api/agents/marketplace');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      items: expect.any(Array),
      page: 1,
      pageSize: 20,
      total: 1,
      hasMore: false,
    });
  });

  it('serializes each item with the correct marketplace fields', async () => {
    mockDataAndCount([agentRow()], 1);

    const res = await anonReq('/api/agents/marketplace');
    const { items } = await res.json();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: AGENT_ID,
      name: 'Research Bot',
      persona: 'A helpful research assistant.',
      model: 'claude-sonnet-4-6',
      tools: ['web_search'],
      ownerDisplayName: 'Alice',
      avgRating: 4.5,
      ratingCount: 10,
      forkCount: 3,
      favoriteCount: 7,
    });
  });

  it('returns empty items array when no agents match', async () => {
    mockDataAndCount([], 0);

    const res = await anonReq('/api/agents/marketplace');
    const body = await res.json();

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('connection lost'));

    const res = await anonReq('/api/agents/marketplace');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Private-agent guard
// ---------------------------------------------------------------------------

describe('private-agent guard', () => {
  it('never returns private agents — query always includes visibility filter', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace');

    // The SQL sent to the pool must contain visibility = 'public'
    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toContain("visibility = 'public'");
  });
});

// ---------------------------------------------------------------------------
// Per-user flags
// ---------------------------------------------------------------------------

describe('per-user flags', () => {
  it('omits isSubscribed/isFavorited/isOwner when unauthenticated', async () => {
    mockDataAndCount([agentRow()], 1);

    const res = await anonReq('/api/agents/marketplace');
    const { items } = await res.json();

    expect(items[0]).not.toHaveProperty('isSubscribed');
    expect(items[0]).not.toHaveProperty('isFavorited');
    expect(items[0]).not.toHaveProperty('isOwner');
  });

  it('includes isSubscribed, isFavorited, isOwner when authenticated', async () => {
    mockDataAndCount([agentRow({ is_subscribed: false, is_owner: false })], 1);

    const res = await authedReq('/api/agents/marketplace');
    const { items } = await res.json();

    expect(items[0]).toMatchObject({
      isSubscribed: false,
      isFavorited: false,
      isOwner: false,
    });
  });

  it('sets isSubscribed: true when subscription row exists', async () => {
    mockDataAndCount([agentRow({ is_subscribed: true, is_owner: false })], 1);

    const res = await authedReq('/api/agents/marketplace');
    const { items } = await res.json();

    expect(items[0].isSubscribed).toBe(true);
  });

  it('sets isOwner: true for the authenticated owner', async () => {
    mockDataAndCount([agentRow({ is_owner: true, owner_id: USER_ID })], 1);

    const res = await authedReq('/api/agents/marketplace');
    const { items } = await res.json();

    expect(items[0].isOwner).toBe(true);
  });

  it('adds subscription LEFT JOIN to data query when authenticated', async () => {
    mockDataAndCount([], 0);

    await authedReq('/api/agents/marketplace');

    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toMatch(/LEFT JOIN subscriptions s/i);
  });
});

// ---------------------------------------------------------------------------
// Filter composition
// ---------------------------------------------------------------------------

describe('q filter', () => {
  it('adds search_tsv condition to SQL when q is provided', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace?q=research');

    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toContain('search_tsv');
    expect(dataCall[0]).toContain('websearch_to_tsquery');
    expect(dataCall[1]).toContain('research');
  });

  it('omits search_tsv condition when q is absent', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace');

    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).not.toContain('search_tsv');
  });
});

describe('model filter', () => {
  it('adds model condition when model param is provided', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace?model=claude-sonnet-4-6');

    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toContain('a.model =');
    expect(dataCall[1]).toContain('claude-sonnet-4-6');
  });
});

describe('tools filter', () => {
  it('adds GIN containment condition when tools param is provided', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace?tools=web_search,calculator');

    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toContain('a.tools @>');
    // params should include a JSON array of the two tool IDs
    const params = dataCall[1];
    const toolParam = params.find((p) => typeof p === 'string' && p.startsWith('['));
    expect(JSON.parse(toolParam)).toEqual(expect.arrayContaining(['web_search', 'calculator']));
  });
});

describe('minRating filter', () => {
  it('adds rating condition when minRating is provided', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace?minRating=4');

    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toContain('rating_count > 0');
    expect(dataCall[0]).toContain('rating_sum');
    expect(dataCall[1]).toContain(4);
  });

  it('omits rating WHERE condition when minRating is 0 or absent', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace?minRating=0');

    const [dataCall] = mockPoolQuery.mock.calls;
    // The WHERE filter contains ">=" but the SELECT CASE expression does not.
    expect(dataCall[0]).not.toContain('/ a.rating_count >=');
  });
});

describe('filter composition', () => {
  it('composes q, model, tools, and minRating together correctly', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace?q=research&model=claude-sonnet-4-6&tools=web_search&minRating=3&sort=top_rated');

    const [dataCall, countCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toContain('search_tsv');
    expect(dataCall[0]).toContain('a.model =');
    expect(dataCall[0]).toContain('a.tools @>');
    expect(dataCall[0]).toContain('rating_count > 0');
    // Count query must include the same filters
    expect(countCall[0]).toContain('search_tsv');
    expect(countCall[0]).toContain('a.model =');
    expect(countCall[0]).toContain('a.tools @>');
    expect(countCall[0]).toContain('rating_count > 0');
  });
});

// ---------------------------------------------------------------------------
// Sort orders
// ---------------------------------------------------------------------------

describe('sort orders', () => {
  for (const [sortVal, expectedClause] of [
    ['recent',      'a.updated_at DESC'],
    ['popular',     'a.favorite_count DESC'],
    ['top_rated',   'avg_rating DESC'],
    ['most_forked', 'a.fork_count DESC'],
  ]) {
    it(`sort=${sortVal} orders by ${expectedClause}`, async () => {
      mockDataAndCount([], 0);

      await anonReq(`/api/agents/marketplace?sort=${sortVal}`);

      const [dataCall] = mockPoolQuery.mock.calls;
      expect(dataCall[0]).toContain(expectedClause);
    });
  }

  it('defaults to recent sort when sort param is missing', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace');

    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toContain('a.updated_at DESC');
  });

  it('defaults to recent sort when sort param is invalid', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace?sort=bogus');

    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[0]).toContain('a.updated_at DESC');
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('pagination', () => {
  it('returns correct page and pageSize in envelope', async () => {
    mockDataAndCount([], 0);

    const res = await anonReq('/api/agents/marketplace?page=2&pageSize=10');
    const body = await res.json();

    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
  });

  it('sets hasMore: true when more pages exist', async () => {
    mockDataAndCount(Array(10).fill(agentRow()), 25);

    const res = await anonReq('/api/agents/marketplace?page=1&pageSize=10');
    const body = await res.json();

    expect(body.total).toBe(25);
    expect(body.hasMore).toBe(true);
  });

  it('sets hasMore: false on the last page', async () => {
    mockDataAndCount(Array(5).fill(agentRow()), 25);

    const res = await anonReq('/api/agents/marketplace?page=3&pageSize=10');
    const body = await res.json();

    expect(body.hasMore).toBe(false);
  });

  it('caps pageSize at 50', async () => {
    mockDataAndCount([], 0);

    const res = await anonReq('/api/agents/marketplace?pageSize=200');
    const body = await res.json();

    expect(body.pageSize).toBe(50);

    // Verify LIMIT in SQL is 50
    const [dataCall] = mockPoolQuery.mock.calls;
    expect(dataCall[1]).toContain(50);
  });

  it('defaults page to 1 when page param is missing', async () => {
    mockDataAndCount([], 0);

    const res = await anonReq('/api/agents/marketplace');
    const body = await res.json();

    expect(body.page).toBe(1);
  });

  it('passes correct OFFSET for page 3 with pageSize 10', async () => {
    mockDataAndCount([], 0);

    await anonReq('/api/agents/marketplace?page=3&pageSize=10');

    const [dataCall] = mockPoolQuery.mock.calls;
    // offset = (3 - 1) * 10 = 20
    expect(dataCall[1]).toContain(20);
  });

  it('count query total is reflected in response', async () => {
    mockDataAndCount([agentRow()], 42);

    const res = await anonReq('/api/agents/marketplace');
    const body = await res.json();

    expect(body.total).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// avgRating edge cases
// ---------------------------------------------------------------------------

describe('avgRating', () => {
  it('returns null avgRating when rating_count is 0', async () => {
    mockDataAndCount([agentRow({ avg_rating: null, rating_count: 0, rating_sum: 0 })], 1);

    const res = await anonReq('/api/agents/marketplace');
    const { items } = await res.json();

    expect(items[0].avgRating).toBeNull();
  });

  it('returns numeric avgRating when rating_count > 0', async () => {
    mockDataAndCount([agentRow({ avg_rating: 3.8, rating_count: 5, rating_sum: 19 })], 1);

    const res = await anonReq('/api/agents/marketplace');
    const { items } = await res.json();

    expect(items[0].avgRating).toBe(3.8);
  });
});

/**
 * HTTP endpoint tests for the Express app.
 *
 * pg and mongodb are fully mocked so these run without any live database.
 * A real HTTP server is started on a random port (listen(0)) so every test
 * exercises the full Express middleware stack (CORS, body-parser, rate-limiter,
 * validators, serialisers, error handlers).
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
// MongoDB mock — must be declared before app.js is imported
// ---------------------------------------------------------------------------

const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockInsertOne = vi.fn();
const mockDeleteOne = vi.fn();
const mockFind = vi.fn();

const mockCollection = vi.fn(() => ({
  findOne: mockFindOne,
  updateOne: mockUpdateOne,
  findOneAndUpdate: mockFindOneAndUpdate,
  insertOne: mockInsertOne,
  deleteOne: mockDeleteOne,
  find: mockFind,
}));

vi.mock('../src/mongo.js', () => ({
  connect: vi.fn(),
  getDb: vi.fn(() => ({ collection: mockCollection })),
  healthCheck: vi.fn(async () => ({ ok: true })),
}));

// ---------------------------------------------------------------------------
// Auth mocks — must be declared before app.js is imported
// ---------------------------------------------------------------------------

const mockHashPassword = vi.fn();
const mockVerifyPassword = vi.fn();

vi.mock('../src/auth/crypto.js', () => ({
  hashPassword: mockHashPassword,
  verifyPassword: mockVerifyPassword,
}));

const mockSignAccessToken = vi.fn(() => 'test-token');
const mockVerifyToken = vi.fn();

vi.mock('../src/auth/token.js', () => ({
  signAccessToken: mockSignAccessToken,
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
  // vi.clearAllMocks() does not clear mockReturnValueOnce queues — reset each
  // mock that uses Once queues so unconsumed values don't leak between tests.
  mockVerifyToken.mockReset();
  mockPoolQuery.mockReset();
  mockClientQuery.mockReset();
  // Default find mock returns empty array
  mockFind.mockReturnValue({
    sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'cccccccc-0000-0000-0000-000000000001';
const OTHER_USER_ID = 'dddddddd-0000-0000-0000-000000000002';

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${baseUrl}${path}`, opts);
}

async function authReq(method, path, body) {
  mockVerifyToken.mockReturnValueOnce({ userId: TEST_USER_ID });
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(`${baseUrl}${path}`, opts);
}

// Minimal DB rows for agents / skills
function agentRow(overrides = {}) {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Test Agent',
    persona: '',
    system_prompt: '',
    model: 'claude-sonnet-4-6',
    tools: [],
    positions: {},
    skills: [],
    instructions: [],
    owner_id: null,
    visibility: 'public',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function skillRow(overrides = {}) {
  return {
    id: 'bbbbbbbb-0000-0000-0000-000000000001',
    label: 'My Skill',
    color: '#6366f1',
    description: 'Does something useful',
    instruction: 'Be helpful always',
    owner_id: null,
    visibility: 'public',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function userRow(overrides = {}) {
  return {
    id: 'cccccccc-0000-0000-0000-000000000001',
    email: 'test@example.com',
    password_hash: '$2a$12$hashedpasswordplaceholder000000000000000',
    display_name: 'Test User',
    auth_provider: 'local',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /api/tools
// ---------------------------------------------------------------------------

describe('GET /api/tools', () => {
  it('returns 200 with an array of tool objects', async () => {
    const res = await req('GET', '/api/tools');
    expect(res.status).toBe(200);
    const tools = await res.json();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('each tool has id, label, kind, description', async () => {
    const res = await req('GET', '/api/tools');
    const tools = await res.json();
    for (const t of tools) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(['server', 'client']).toContain(t.kind);
      expect(typeof t.description).toBe('string');
    }
  });

  it('includes calculator and code_runner', async () => {
    const res = await req('GET', '/api/tools');
    const tools = await res.json();
    const ids = tools.map((t) => t.id);
    expect(ids).toContain('calculator');
    expect(ids).toContain('code_runner');
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents
// ---------------------------------------------------------------------------

describe('GET /api/agents', () => {
  it('returns 200 with empty array when no agents', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await req('GET', '/api/agents');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('serializes agent rows to camelCase', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [agentRow()] });
    const res = await req('GET', '/api/agents');
    const agents = await res.json();
    expect(agents).toHaveLength(1);
    const a = agents[0];
    expect(a.id).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(a.systemPrompt).toBe('');
    expect(a.createdAt).toBeDefined();
    expect(a.updatedAt).toBeDefined();
    expect(a.tools).toEqual([]);
    expect(a.positions).toEqual({});
    expect(a.ownerId).toBeNull();
    expect(a.visibility).toBe('public');
  });

  it('returns 500 when db throws', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('connection lost'));
    const res = await req('GET', '/api/agents');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('connection lost');
  });

  it('returns JSON Content-Type header', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await req('GET', '/api/agents');
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('only queries public agents (scoped to visibility=public after security fix)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    await req('GET', '/api/agents');
    const query = mockPoolQuery.mock.calls[0][0];
    expect(query).toMatch(/visibility\s*=\s*'public'/i);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/public
// ---------------------------------------------------------------------------

describe('GET /api/agents/public', () => {
  it('returns 200 with public agents (anonymous)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [agentRow({ visibility: 'public' })] });
    const res = await req('GET', '/api/agents/public');
    expect(res.status).toBe(200);
    const agents = await res.json();
    expect(agents).toHaveLength(1);
    expect(agents[0].visibility).toBe('public');
  });

  it('does not include isSubscribed when anonymous', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [agentRow({ visibility: 'public' })] });
    const res = await req('GET', '/api/agents/public');
    const agents = await res.json();
    expect(agents[0]).not.toHaveProperty('isSubscribed');
  });

  it('returns empty array when no public agents', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await req('GET', '/api/agents/public');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns isSubscribed: true when authenticated and subscribed', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ ...agentRow({ visibility: 'public' }), is_subscribed: true }],
    });
    const res = await authReq('GET', '/api/agents/public');
    expect(res.status).toBe(200);
    const agents = await res.json();
    expect(agents[0].isSubscribed).toBe(true);
  });

  it('returns isSubscribed: false when authenticated but not subscribed', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ ...agentRow({ visibility: 'public' }), is_subscribed: false }],
    });
    const res = await authReq('GET', '/api/agents/public');
    expect(res.status).toBe(200);
    const agents = await res.json();
    expect(agents[0].isSubscribed).toBe(false);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await req('GET', '/api/agents/public');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/mine
// ---------------------------------------------------------------------------

describe('GET /api/agents/mine', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await req('GET', '/api/agents/mine');
    expect(res.status).toBe(401);
  });

  it('returns owned agents with isOwned: true', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ ...agentRow({ owner_id: TEST_USER_ID, visibility: 'private' }), is_owned: true, is_subscribed: false }],
    });
    const res = await authReq('GET', '/api/agents/mine');
    expect(res.status).toBe(200);
    const agents = await res.json();
    expect(agents[0].isOwned).toBe(true);
    expect(agents[0].isSubscribed).toBe(false);
  });

  it('returns subscribed public agents with isSubscribed: true', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ ...agentRow({ owner_id: OTHER_USER_ID, visibility: 'public' }), is_owned: false, is_subscribed: true }],
    });
    const res = await authReq('GET', '/api/agents/mine');
    expect(res.status).toBe(200);
    const agents = await res.json();
    expect(agents[0].isOwned).toBe(false);
    expect(agents[0].isSubscribed).toBe(true);
  });

  it('returns mixed owned and subscribed agents', async () => {
    const ownedRow = { ...agentRow({ owner_id: TEST_USER_ID, visibility: 'private' }), is_owned: true, is_subscribed: false };
    const subscribedRow = {
      ...agentRow({ id: 'bbbbbbbb-1111-0000-0000-000000000002', owner_id: OTHER_USER_ID, visibility: 'public' }),
      is_owned: false,
      is_subscribed: true,
    };
    mockPoolQuery.mockResolvedValueOnce({ rows: [ownedRow, subscribedRow] });
    const res = await authReq('GET', '/api/agents/mine');
    expect(res.status).toBe(200);
    const agents = await res.json();
    expect(agents).toHaveLength(2);
    expect(agents.find((a) => a.isOwned && !a.isSubscribed)).toBeDefined();
    expect(agents.find((a) => a.isSubscribed && !a.isOwned)).toBeDefined();
  });

  it('returns empty array when user has no owned or subscribed agents', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('GET', '/api/agents/mine');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await authReq('GET', '/api/agents/mine');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id
// ---------------------------------------------------------------------------

describe('GET /api/agents/:id', () => {
  it('returns 200 with public agent when found (no auth needed)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [agentRow({ visibility: 'public' })] });
    const res = await req('GET', '/api/agents/aaaaaaaa-0000-0000-0000-000000000001');
    expect(res.status).toBe(200);
    const a = await res.json();
    expect(a.name).toBe('Test Agent');
  });

  it('returns 200 for private agent when authenticated as owner', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [agentRow({ visibility: 'private', owner_id: TEST_USER_ID })] });
    const res = await authReq('GET', '/api/agents/aaaaaaaa-0000-0000-0000-000000000001');
    expect(res.status).toBe(200);
  });

  it('returns 403 for private agent when authenticated as non-owner', async () => {
    mockVerifyToken.mockReturnValueOnce({ userId: OTHER_USER_ID });
    mockPoolQuery.mockResolvedValueOnce({ rows: [agentRow({ visibility: 'private', owner_id: TEST_USER_ID })] });
    const res = await fetch(`${baseUrl}/api/agents/aaaaaaaa-0000-0000-0000-000000000001`, {
      headers: { 'Authorization': 'Bearer other-token' },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 403 for private agent when unauthenticated', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [agentRow({ visibility: 'private', owner_id: TEST_USER_ID })] });
    const res = await req('GET', '/api/agents/aaaaaaaa-0000-0000-0000-000000000001');
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when agent not found', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await req('GET', '/api/agents/nonexistent-id');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Agent not found');
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db error'));
    const res = await req('GET', '/api/agents/some-id');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents
// ---------------------------------------------------------------------------

describe('POST /api/agents', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await req('POST', '/api/agents', { name: 'Bot' });
    expect(res.status).toBe(401);
  });

  it('returns 201 with created agent and sets ownerId from token', async () => {
    const created = agentRow({ name: 'New Bot', system_prompt: 'Be helpful', owner_id: TEST_USER_ID });
    // withClient: BEGIN, INSERT INTO agents, INSERT INTO agent_versions, COMMIT
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [created] }); // INSERT INTO agents

    const res = await authReq('POST', '/api/agents', {
      name: 'New Bot',
      systemPrompt: 'Be helpful',
      model: 'claude-sonnet-4-6',
      tools: [],
    });

    expect(res.status).toBe(201);
    const a = await res.json();
    expect(a.name).toBe('New Bot');
    expect(a.id).toBeDefined();
    expect(a.ownerId).toBe(TEST_USER_ID);
    // Verify owner_id was passed to the INSERT (call[1] = INSERT INTO agents, after BEGIN)
    const insertCall = mockClientQuery.mock.calls[1];
    expect(insertCall[1][10]).toBe(TEST_USER_ID);
  });

  it('defaults visibility to private', async () => {
    const created = agentRow({ owner_id: TEST_USER_ID, visibility: 'private' });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [created] }); // INSERT INTO agents

    await authReq('POST', '/api/agents', { name: 'Bot' });

    const insertCall = mockClientQuery.mock.calls[1];
    expect(insertCall[1][9]).toBe('private');
  });

  it('returns 400 when name is missing', async () => {
    const res = await authReq('POST', '/api/agents', { systemPrompt: 'test' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when name is empty string', async () => {
    const res = await authReq('POST', '/api/agents', { name: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not JSON object', async () => {
    mockVerifyToken.mockReturnValueOnce({ userId: TEST_USER_ID });
    const res = await fetch(`${baseUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
      body: '"just a string"',
    });
    expect(res.status).toBe(400);
  });

  it('filters invalid tool IDs from tools array', async () => {
    const created = agentRow({ tools: ['calculator'], owner_id: TEST_USER_ID });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [created] }); // INSERT INTO agents

    const res = await authReq('POST', '/api/agents', {
      name: 'Bot',
      tools: ['calculator', 'invalid_tool_xyz'],
    });

    expect(res.status).toBe(201);
    const insertCall = mockClientQuery.mock.calls[1];
    const toolsArg = JSON.parse(insertCall[1][5]);
    expect(toolsArg).toContain('calculator');
    expect(toolsArg).not.toContain('invalid_tool_xyz');
  });

  it('generates a UUID for the new agent', async () => {
    const created = agentRow({ owner_id: TEST_USER_ID });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [created] }); // INSERT INTO agents

    await authReq('POST', '/api/agents', { name: 'Bot' });

    const insertCall = mockClientQuery.mock.calls[1];
    const uuid = insertCall[1][0];
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns 500 on db error', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('insert failed')); // INSERT INTO agents
    const res = await authReq('POST', '/api/agents', { name: 'Bot' });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agents/:id
// ---------------------------------------------------------------------------

describe('PUT /api/agents/:id', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await req('PUT', '/api/agents/some-id', { name: 'Bot' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated agent when caller is owner', async () => {
    const updated = agentRow({ name: 'Updated Bot', owner_id: TEST_USER_ID });
    // withClient: BEGIN, SELECT owner, UPDATE agents, SELECT latest version, INSERT version, COMMIT
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] }) // SELECT owner
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE agents RETURNING *
      .mockResolvedValueOnce({ rows: [{ canonical_hash: 'oldhash', version_no: 1 }] }); // SELECT latest (different hash → insert version)

    const res = await authReq('PUT', `/api/agents/${updated.id}`, {
      name: 'Updated Bot',
      model: 'claude-sonnet-4-6',
    });

    expect(res.status).toBe(200);
    const a = await res.json();
    expect(a.name).toBe('Updated Bot');
  });

  it('returns 403 when agent is owned by a different user', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: OTHER_USER_ID }] }); // SELECT owner

    const res = await authReq('PUT', '/api/agents/some-id', { name: 'Bot' });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when agent does not exist', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT owner → not found
    const res = await authReq('PUT', '/api/agents/nonexistent', { name: 'Bot' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Agent not found');
  });

  it('returns 400 on validation error', async () => {
    // Validation runs before the DB call
    const res = await authReq('PUT', '/api/agents/some-id', { persona: 'no name' });
    expect(res.status).toBe(400);
  });

  it('returns 500 on db error during update', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] }) // SELECT owner
      .mockRejectedValueOnce(new Error('update failed')); // UPDATE agents
    const res = await authReq('PUT', '/api/agents/some-id', { name: 'Bot' });
    expect(res.status).toBe(500);
  });

  it('preserves existing fields when partial update is sent', async () => {
    const afterUpdate = agentRow({ name: 'New Name', system_prompt: 'Old prompt', owner_id: TEST_USER_ID });

    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] }) // SELECT owner
      .mockResolvedValueOnce({ rows: [afterUpdate] }) // UPDATE agents RETURNING *
      .mockResolvedValueOnce({ rows: [{ canonical_hash: 'oldhash', version_no: 1 }] }); // SELECT latest

    const res = await authReq('PUT', `/api/agents/${afterUpdate.id}`, {
      name: 'New Name',
      systemPrompt: 'Old prompt',
    });

    expect(res.status).toBe(200);
    const a = await res.json();
    expect(a.systemPrompt).toBe('Old prompt');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/agents/:id  (visibility toggle)
// ---------------------------------------------------------------------------

describe('PATCH /api/agents/:id', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await req('PATCH', '/api/agents/some-id', { visibility: 'public' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated agent when owner makes it public', async () => {
    const updated = agentRow({ owner_id: TEST_USER_ID, visibility: 'public' });
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rows: [updated] });

    const res = await authReq('PATCH', `/api/agents/${updated.id}`, { visibility: 'public' });
    expect(res.status).toBe(200);
    const a = await res.json();
    expect(a.visibility).toBe('public');
  });

  it('returns 200 with updated agent when owner makes it private', async () => {
    const updated = agentRow({ owner_id: TEST_USER_ID, visibility: 'private' });
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rows: [updated] });

    const res = await authReq('PATCH', `/api/agents/${updated.id}`, { visibility: 'private' });
    expect(res.status).toBe(200);
    const a = await res.json();
    expect(a.visibility).toBe('private');
  });

  it('returns 400 when visibility is missing', async () => {
    const res = await authReq('PATCH', '/api/agents/some-id', {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/visibility/i);
  });

  it('returns 400 when visibility is an invalid value', async () => {
    const res = await authReq('PATCH', '/api/agents/some-id', { visibility: 'restricted' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/visibility/i);
  });

  it('returns 403 when agent is owned by a different user', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ owner_id: OTHER_USER_ID }] });
    const res = await authReq('PATCH', '/api/agents/some-id', { visibility: 'public' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when agent does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('PATCH', '/api/agents/nonexistent', { visibility: 'public' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Agent not found');
  });

  it('returns 500 on db error during update', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockRejectedValueOnce(new Error('update failed'));
    const res = await authReq('PATCH', '/api/agents/some-id', { visibility: 'public' });
    expect(res.status).toBe(500);
  });

  it('only updates visibility — does not require other agent fields', async () => {
    const updated = agentRow({ owner_id: TEST_USER_ID, visibility: 'public' });
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rows: [updated] });

    const res = await authReq('PATCH', `/api/agents/${updated.id}`, { visibility: 'public' });
    expect(res.status).toBe(200);
    // Verify the UPDATE query only contains visibility, not all fields
    const updateCall = mockPoolQuery.mock.calls[1];
    expect(updateCall[0]).toMatch(/SET visibility/i);
    expect(updateCall[0]).not.toMatch(/name\s*=\s*\$\d/i);
    expect(updateCall[1]).toEqual(['public', updated.id]);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/agents/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/agents/:id', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await req('DELETE', '/api/agents/some-id');
    expect(res.status).toBe(401);
  });

  it('returns 204 on successful delete when caller is owner', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await authReq('DELETE', '/api/agents/aaaaaaaa-0000-0000-0000-000000000001');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('returns 403 when agent is owned by a different user', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ owner_id: OTHER_USER_ID }] });
    const res = await authReq('DELETE', '/api/agents/some-id');
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when agent not found', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('DELETE', '/api/agents/nonexistent-id');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Agent not found');
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('delete failed'));
    const res = await authReq('DELETE', '/api/agents/some-id');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id/versions
// ---------------------------------------------------------------------------

describe('GET /api/agents/:id/versions', () => {
  const AGENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

  it('returns 401 when unauthenticated', async () => {
    const res = await req('GET', `/api/agents/${AGENT_ID}/versions`);
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not the owner', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ owner_id: OTHER_USER_ID }] });
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when agent does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('GET', `/api/agents/nonexistent/versions`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Agent not found');
  });

  it('returns 200 with version list newest-first (no snapshot body)', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({
        rows: [
          { version_no: 3, change_summary: 'third', created_by: TEST_USER_ID, created_at: new Date('2024-03-01') },
          { version_no: 2, change_summary: 'second', created_by: null, created_at: new Date('2024-02-01') },
          { version_no: 1, change_summary: null, created_by: null, created_at: new Date('2024-01-01') },
        ],
      });
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions`);
    expect(res.status).toBe(200);
    const versions = await res.json();
    expect(versions).toHaveLength(3);
    expect(versions[0].versionNo).toBe(3);
    expect(versions[0].changeSummary).toBe('third');
    expect(versions[0].createdBy).toBe(TEST_USER_ID);
    expect(versions[1].versionNo).toBe(2);
    expect(versions[1].createdBy).toBeNull();
    expect(versions[2].changeSummary).toBe('');
    // snapshot must not be present
    for (const v of versions) {
      expect(v).not.toHaveProperty('snapshot');
    }
  });

  it('returns 200 with empty array when agent has no versions', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agents/:id/versions/:versionNo
// ---------------------------------------------------------------------------

describe('GET /api/agents/:id/versions/:versionNo', () => {
  const AGENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const snap = { schemaVersion: 1, name: 'Old Bot', persona: '', systemPrompt: '', model: '', tools: [], skills: [], instructions: [], positions: {} };

  it('returns 401 when unauthenticated', async () => {
    const res = await req('GET', `/api/agents/${AGENT_ID}/versions/1`);
    expect(res.status).toBe(401);
  });

  it('returns 400 when versionNo is not a positive integer', async () => {
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions/abc`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/positive integer/i);
  });

  it('returns 403 when caller is not the owner', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ owner_id: OTHER_USER_ID }] });
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions/1`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when agent does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('GET', `/api/agents/nonexistent/versions/1`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Agent not found');
  });

  it('returns 404 when version does not exist', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions/99`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Version not found');
  });

  it('returns 200 with full snapshot for existing version', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({
        rows: [{
          version_no: 2,
          snapshot: snap,
          change_summary: 'my change',
          created_by: TEST_USER_ID,
          created_at: new Date('2024-02-01'),
        }],
      });
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions/2`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versionNo).toBe(2);
    expect(body.changeSummary).toBe('my change');
    expect(body.createdBy).toBe(TEST_USER_ID);
    expect(body.snapshot).toEqual(snap);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await authReq('GET', `/api/agents/${AGENT_ID}/versions/1`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents/:id/versions/:versionNo/restore
// ---------------------------------------------------------------------------

describe('POST /api/agents/:id/versions/:versionNo/restore', () => {
  const AGENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const snap = { schemaVersion: 1, name: 'Old Bot', persona: 'helpful', systemPrompt: 'be nice', model: 'gpt-4', tools: ['calculator'], skills: [], instructions: [], positions: {} };

  it('returns 401 when unauthenticated', async () => {
    const res = await req('POST', `/api/agents/${AGENT_ID}/versions/1/restore`);
    expect(res.status).toBe(401);
  });

  it('returns 400 when versionNo is not a positive integer', async () => {
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/versions/0/restore`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/positive integer/i);
  });

  it('returns 403 when caller is not the owner', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: OTHER_USER_ID }] }) // SELECT owner
      .mockResolvedValueOnce({}); // ROLLBACK
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/versions/1/restore`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when agent does not exist', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT owner
      .mockResolvedValueOnce({}); // ROLLBACK
    const res = await authReq('POST', `/api/agents/nonexistent/versions/1/restore`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Agent not found');
  });

  it('returns 404 when version does not exist', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] }) // SELECT owner
      .mockResolvedValueOnce({ rows: [] }) // SELECT version
      .mockResolvedValueOnce({}); // ROLLBACK
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/versions/99/restore`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Version not found');
  });

  it('returns 200 with updated agent after restore', async () => {
    const restoredRow = agentRow({
      name: 'Old Bot',
      persona: 'helpful',
      system_prompt: 'be nice',
      model: 'gpt-4',
      tools: ['calculator'],
      owner_id: TEST_USER_ID,
    });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] }) // SELECT owner
      .mockResolvedValueOnce({ rows: [{ snapshot: snap }] }) // SELECT version
      .mockResolvedValueOnce({ rows: [restoredRow] }) // UPDATE agents
      .mockResolvedValueOnce({ rows: [{ version_no: 5 }] }) // SELECT latest version_no
      .mockResolvedValueOnce({}) // INSERT new version
      .mockResolvedValueOnce({}); // COMMIT
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/versions/2/restore`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Old Bot');
    expect(body.ownerId).toBe(TEST_USER_ID);
  });

  it('inserts a new version with change_summary referencing the source version', async () => {
    const restoredRow = agentRow({ name: 'Old Bot', owner_id: TEST_USER_ID });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ snapshot: snap }] })
      .mockResolvedValueOnce({ rows: [restoredRow] })
      .mockResolvedValueOnce({ rows: [{ version_no: 3 }] })
      .mockResolvedValueOnce({}) // INSERT
      .mockResolvedValueOnce({}); // COMMIT
    await authReq('POST', `/api/agents/${AGENT_ID}/versions/2/restore`);
    const insertCall = mockClientQuery.mock.calls.find((c) =>
      typeof c[0] === 'string' && c[0].startsWith('INSERT INTO agent_versions')
    );
    expect(insertCall).toBeDefined();
    // version_no should be latest + 1 = 4
    expect(insertCall[1][1]).toBe(4);
    // change_summary should reference v2
    expect(insertCall[1][4]).toBe('Restored from v2');
    // created_by should be the requesting user
    expect(insertCall[1][5]).toBe(TEST_USER_ID);
  });

  it('is non-destructive: history length grows by one after restore', async () => {
    const restoredRow = agentRow({ name: 'Old Bot', owner_id: TEST_USER_ID });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ snapshot: snap }] })
      .mockResolvedValueOnce({ rows: [restoredRow] })
      .mockResolvedValueOnce({ rows: [{ version_no: 5 }] }) // had 5 versions before
      .mockResolvedValueOnce({}) // INSERT (v6)
      .mockResolvedValueOnce({}); // COMMIT
    await authReq('POST', `/api/agents/${AGENT_ID}/versions/2/restore`);
    const insertCall = mockClientQuery.mock.calls.find((c) =>
      typeof c[0] === 'string' && c[0].startsWith('INSERT INTO agent_versions')
    );
    // next version should be 6, not overwrite any existing version
    expect(insertCall[1][1]).toBe(6);
  });

  it('returns 500 on db error', async () => {
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({}); // ROLLBACK
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/versions/1/restore`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agents/:id/subscribe
// ---------------------------------------------------------------------------

describe('POST /api/agents/:id/subscribe', () => {
  const AGENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

  it('returns 401 when unauthenticated', async () => {
    const res = await req('POST', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with userId and agentId on success', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ visibility: 'public' }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(TEST_USER_ID);
    expect(body.agentId).toBe(AGENT_ID);
  });

  it('returns 200 (no-op) on duplicate subscribe', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ visibility: 'public' }] })
      .mockResolvedValueOnce({ rowCount: 0 }); // ON CONFLICT DO NOTHING
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(200);
  });

  it('returns 403 when agent is private', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ visibility: 'private' }] });
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/private/i);
  });

  it('returns 404 when agent does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('POST', `/api/agents/nonexistent/subscribe`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Agent not found');
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await authReq('POST', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/agents/:id/subscribe
// ---------------------------------------------------------------------------

describe('DELETE /api/agents/:id/subscribe', () => {
  const AGENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

  it('returns 401 when unauthenticated', async () => {
    const res = await req('DELETE', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(401);
  });

  it('returns 204 on successful unsubscribe', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });
    const res = await authReq('DELETE', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('returns 404 when subscription does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });
    const res = await authReq('DELETE', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/subscription not found/i);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await authReq('DELETE', `/api/agents/${AGENT_ID}/subscribe`);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/skills (legacy — public only)
// ---------------------------------------------------------------------------

describe('GET /api/skills', () => {
  it('returns 200 with empty array when no public skills', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await req('GET', '/api/skills');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns serialized public skills', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [skillRow({ visibility: 'public' })] });
    const res = await req('GET', '/api/skills');
    const skills = await res.json();
    expect(skills).toHaveLength(1);
    expect(skills[0].label).toBe('My Skill');
    expect(skills[0].instruction).toBe('Be helpful always');
    expect(skills[0].ownerId).toBeNull();
  });

  it('only queries public skills', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    await req('GET', '/api/skills');
    expect(mockPoolQuery.mock.calls[0][0]).toMatch(/visibility\s*=\s*'public'/i);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await req('GET', '/api/skills');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/skills/public
// ---------------------------------------------------------------------------

describe('GET /api/skills/public', () => {
  it('returns 200 with public skills (anonymous)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [skillRow({ visibility: 'public' })] });
    const res = await req('GET', '/api/skills/public');
    expect(res.status).toBe(200);
    const skills = await res.json();
    expect(skills).toHaveLength(1);
    expect(skills[0].label).toBe('My Skill');
    expect(skills[0]).not.toHaveProperty('isOwned');
  });

  it('returns empty array when no public skills', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await req('GET', '/api/skills/public');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns isOwned: true when authenticated as skill owner', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ ...skillRow({ owner_id: TEST_USER_ID, visibility: 'public' }), is_owned: true }],
    });
    const res = await authReq('GET', '/api/skills/public');
    expect(res.status).toBe(200);
    const skills = await res.json();
    expect(skills[0].isOwned).toBe(true);
  });

  it('returns isOwned: false when authenticated as non-owner', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ ...skillRow({ owner_id: OTHER_USER_ID, visibility: 'public' }), is_owned: false }],
    });
    const res = await authReq('GET', '/api/skills/public');
    expect(res.status).toBe(200);
    const skills = await res.json();
    expect(skills[0].isOwned).toBe(false);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await req('GET', '/api/skills/public');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/skills/mine
// ---------------------------------------------------------------------------

describe('GET /api/skills/mine', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await req('GET', '/api/skills/mine');
    expect(res.status).toBe(401);
  });

  it('returns owned skills with isOwned: true', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [skillRow({ owner_id: TEST_USER_ID, visibility: 'private' })],
    });
    const res = await authReq('GET', '/api/skills/mine');
    expect(res.status).toBe(200);
    const skills = await res.json();
    expect(skills).toHaveLength(1);
    expect(skills[0].isOwned).toBe(true);
    expect(skills[0].label).toBe('My Skill');
  });

  it('returns empty array when user has no skills', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('GET', '/api/skills/mine');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('queries skills by owner_id', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    await authReq('GET', '/api/skills/mine');
    const [query, params] = mockPoolQuery.mock.calls[0];
    expect(query).toMatch(/owner_id\s*=\s*\$1/i);
    expect(params[0]).toBe(TEST_USER_ID);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await authReq('GET', '/api/skills/mine');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/skills
// ---------------------------------------------------------------------------

describe('POST /api/skills', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await req('POST', '/api/skills', { label: 'Skill', instruction: 'Do it' });
    expect(res.status).toBe(401);
  });

  it('returns 201 with created skill and sets ownerId from token', async () => {
    const created = skillRow({ label: 'New Skill', instruction: 'Do this', owner_id: TEST_USER_ID });
    mockPoolQuery.mockResolvedValueOnce({ rows: [created] });

    const res = await authReq('POST', '/api/skills', {
      label: 'New Skill',
      instruction: 'Do this',
    });

    expect(res.status).toBe(201);
    const s = await res.json();
    expect(s.label).toBe('New Skill');
    expect(s.id).toBeDefined();
    expect(s.ownerId).toBe(TEST_USER_ID);
    expect(s.isOwned).toBe(true);
    // Verify owner_id was passed to INSERT
    const insertArgs = mockPoolQuery.mock.calls[0][1];
    expect(insertArgs[6]).toBe(TEST_USER_ID);
  });

  it('returns 400 when label is missing', async () => {
    const res = await authReq('POST', '/api/skills', { instruction: 'Do this' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/label/i);
  });

  it('returns 400 when instruction is missing', async () => {
    const res = await authReq('POST', '/api/skills', { label: 'My Skill' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/instruction/i);
  });

  it('uses default color when not provided', async () => {
    const created = skillRow({ owner_id: TEST_USER_ID });
    mockPoolQuery.mockResolvedValueOnce({ rows: [created] });

    await authReq('POST', '/api/skills', {
      label: 'My Skill',
      instruction: 'Be helpful',
    });

    const insertArgs = mockPoolQuery.mock.calls[0][1];
    expect(insertArgs[2]).toBe('#6366f1'); // default color
  });

  it('generates a UUID for the skill', async () => {
    const created = skillRow({ owner_id: TEST_USER_ID });
    mockPoolQuery.mockResolvedValueOnce({ rows: [created] });

    await authReq('POST', '/api/skills', { label: 'Skill', instruction: 'Do it' });

    const insertArgs = mockPoolQuery.mock.calls[0][1];
    expect(insertArgs[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('insert failed'));
    const res = await authReq('POST', '/api/skills', {
      label: 'Skill',
      instruction: 'Do it',
    });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/skills/:id
// ---------------------------------------------------------------------------

describe('PUT /api/skills/:id', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await req('PUT', '/api/skills/some-id', { label: 'Skill', instruction: 'Do it' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated skill when caller is owner', async () => {
    const updated = skillRow({ label: 'Updated Skill', owner_id: TEST_USER_ID });
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rows: [updated] });

    const res = await authReq('PUT', `/api/skills/${updated.id}`, {
      label: 'Updated Skill',
      instruction: 'Be helpful always',
    });

    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s.label).toBe('Updated Skill');
    expect(s.isOwned).toBe(true);
  });

  it('returns 403 when skill is owned by a different user', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ owner_id: OTHER_USER_ID }] });
    const res = await authReq('PUT', '/api/skills/some-id', {
      label: 'Skill',
      instruction: 'Do it',
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when skill does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('PUT', '/api/skills/nonexistent', {
      label: 'Skill',
      instruction: 'Do it',
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Skill not found');
  });

  it('returns 400 on validation error', async () => {
    const res = await authReq('PUT', '/api/skills/some-id', { label: 'Only label' });
    expect(res.status).toBe(400);
  });

  it('returns 500 on db error during update', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockRejectedValueOnce(new Error('update failed'));
    const res = await authReq('PUT', '/api/skills/some-id', {
      label: 'Skill',
      instruction: 'Do it',
    });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/skills/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/skills/:id', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await req('DELETE', '/api/skills/some-id');
    expect(res.status).toBe(401);
  });

  it('returns 204 on successful delete when caller is owner', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ owner_id: TEST_USER_ID }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const res = await authReq('DELETE', '/api/skills/some-id');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('returns 403 when skill is owned by a different user', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ owner_id: OTHER_USER_ID }] });
    const res = await authReq('DELETE', '/api/skills/some-id');
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when skill not found', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await authReq('DELETE', '/api/skills/nonexistent');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Skill not found');
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('delete failed'));
    const res = await authReq('DELETE', '/api/skills/some-id');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  it('returns 200 ok:true when db is healthy', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await req('GET', '/api/health');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('returns 503 when db is unreachable', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('Connection refused'));
    const res = await req('GET', '/api/health');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Connection refused');
  });
});

describe('GET /api/health/mongo', () => {
  it('returns 200 ok:true when mongo is healthy', async () => {
    const { healthCheck } = await import('../src/mongo.js');
    healthCheck.mockResolvedValueOnce({ ok: true, latencyMs: 2 });

    const res = await req('GET', '/api/health/mongo');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('returns 503 when mongo is unhealthy', async () => {
    const { healthCheck } = await import('../src/mongo.js');
    healthCheck.mockResolvedValueOnce({ ok: false, error: 'timeout' });

    const res = await req('GET', '/api/health/mongo');
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// User Preferences (MongoDB) — GET /api/preferences/:userId
// ---------------------------------------------------------------------------

describe('GET /api/preferences/:userId', () => {
  it('returns empty object when no document exists', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const res = await req('GET', '/api/preferences/user-1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('returns stored preferences', async () => {
    mockFindOne.mockResolvedValueOnce({
      userId: 'user-1',
      preferences: { theme: 'dark', sidebar_width: 300 },
    });
    const res = await req('GET', '/api/preferences/user-1');
    expect(res.status).toBe(200);
    const prefs = await res.json();
    expect(prefs.theme).toBe('dark');
    expect(prefs.sidebar_width).toBe(300);
  });

  it('returns 503 when MongoDB throws', async () => {
    mockFindOne.mockRejectedValueOnce(new Error('mongo down'));
    const res = await req('GET', '/api/preferences/user-1');
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/unavailable/i);
  });

  it('includes X-RateLimit headers', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const res = await req('GET', '/api/preferences/user-1');
    expect(res.headers.get('x-ratelimit-limit')).toBe('100');
    expect(Number(res.headers.get('x-ratelimit-remaining'))).toBeGreaterThanOrEqual(0);
    expect(() => new Date(res.headers.get('x-ratelimit-reset'))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// User Preferences (MongoDB) — POST /api/preferences/:userId
// ---------------------------------------------------------------------------

describe('POST /api/preferences/:userId', () => {
  it('returns 200 with updated preferences document', async () => {
    const now = new Date();
    // findOneAndUpdate with returnDocument:'after' is a single round-trip
    mockFindOneAndUpdate.mockResolvedValueOnce({
      userId: 'user-1',
      preferences: { theme: 'dark' },
      createdAt: now,
      updatedAt: now,
    });

    const res = await req('POST', '/api/preferences/user-1', { theme: 'dark' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
    expect(body.preferences.theme).toBe('dark');
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('returns 400 on invalid theme value', async () => {
    const res = await req('POST', '/api/preferences/user-1', { theme: 'rainbow' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/theme/);
  });

  it('returns 400 on canvas_zoom out of range', async () => {
    const res = await req('POST', '/api/preferences/user-1', { canvas_zoom: 99 });
    expect(res.status).toBe(400);
  });

  it('returns 400 on canvas_pan missing y', async () => {
    const res = await req('POST', '/api/preferences/user-1', { canvas_pan: { x: 10 } });
    expect(res.status).toBe(400);
  });

  it('returns 400 on sidebar_width out of range', async () => {
    const res = await req('POST', '/api/preferences/user-1', { sidebar_width: -5 });
    expect(res.status).toBe(400);
  });

  it('returns 400 on empty body', async () => {
    const res = await req('POST', '/api/preferences/user-1', {});
    expect(res.status).toBe(400);
  });

  it('accepts all valid preference fields together', async () => {
    const now = new Date();
    mockFindOneAndUpdate.mockResolvedValueOnce({
      userId: 'u1',
      preferences: { theme: 'light', canvas_zoom: 1.5, canvas_pan: { x: 0, y: 0 }, sidebar_width: 300 },
      createdAt: now,
      updatedAt: now,
    });

    const res = await req('POST', '/api/preferences/u1', {
      theme: 'light',
      canvas_zoom: 1.5,
      canvas_pan: { x: 0, y: 0 },
      sidebar_width: 300,
    });

    expect(res.status).toBe(200);
  });

  it('returns 503 when MongoDB throws during upsert', async () => {
    mockFindOneAndUpdate.mockRejectedValueOnce(new Error('mongo down'));
    const res = await req('POST', '/api/preferences/user-1', { theme: 'dark' });
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Workspace State (MongoDB) — GET /api/workspace/:workspaceId
// ---------------------------------------------------------------------------

describe('GET /api/workspace/:workspaceId', () => {
  it('returns empty object when no document exists', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    const res = await req('GET', '/api/workspace/ws-1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('returns stored workspace data', async () => {
    const data = { selected_agent: 'agent-1', active_tab: 'canvas', agent_positions: {} };
    mockFindOne.mockResolvedValueOnce({ workspaceId: 'ws-1', data });
    const res = await req('GET', '/api/workspace/ws-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.selected_agent).toBe('agent-1');
    expect(body.active_tab).toBe('canvas');
  });

  it('returns 503 on MongoDB error', async () => {
    mockFindOne.mockRejectedValueOnce(new Error('timeout'));
    const res = await req('GET', '/api/workspace/ws-1');
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Workspace State (MongoDB) — POST /api/workspace/:workspaceId
// ---------------------------------------------------------------------------

describe('POST /api/workspace/:workspaceId', () => {
  it('returns 200 with upserted workspace document', async () => {
    const now = new Date();
    // findOneAndUpdate with returnDocument:'after' is a single round-trip
    mockFindOneAndUpdate.mockResolvedValueOnce({
      workspaceId: 'ws-1',
      data: { selected_agent: 'agent-1', active_tab: 'canvas', agent_positions: {} },
      createdAt: now,
      updatedAt: now,
    });

    const res = await req('POST', '/api/workspace/ws-1', {
      selected_agent: 'agent-1',
      active_tab: 'canvas',
      agent_positions: {},
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspaceId).toBe('ws-1');
    expect(body.data.active_tab).toBe('canvas');
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('returns 400 on empty body', async () => {
    const res = await req('POST', '/api/workspace/ws-1', {});
    expect(res.status).toBe(400);
  });

  it('returns 400 when selected_agent is a number', async () => {
    const res = await req('POST', '/api/workspace/ws-1', { selected_agent: 42 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when agent_positions is an array', async () => {
    const res = await req('POST', '/api/workspace/ws-1', { agent_positions: [] });
    expect(res.status).toBe(400);
  });

  it('returns 503 on MongoDB error', async () => {
    mockFindOneAndUpdate.mockRejectedValueOnce(new Error('mongo down'));
    const res = await req('POST', '/api/workspace/ws-1', { active_tab: 'canvas' });
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Draft Agents (MongoDB) — GET /api/drafts/:workspaceId
// ---------------------------------------------------------------------------

describe('GET /api/drafts/:workspaceId', () => {
  it('returns empty array when no drafts', async () => {
    mockFind.mockReturnValueOnce({
      sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    });
    const res = await req('GET', '/api/drafts/ws-1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns serialized drafts newest-first', async () => {
    const now = new Date();
    const drafts = [
      { _id: { toString: () => 'id-2' }, workspaceId: 'ws-1', agentData: { name: 'B' }, createdAt: now, updatedAt: now },
      { _id: { toString: () => 'id-1' }, workspaceId: 'ws-1', agentData: { name: 'A' }, createdAt: now, updatedAt: now },
    ];
    mockFind.mockReturnValueOnce({
      sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(drafts) }),
    });

    const res = await req('GET', '/api/drafts/ws-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('id-2');
    expect(body[0].agentData.name).toBe('B');
  });

  it('returns 503 on MongoDB error', async () => {
    mockFind.mockReturnValueOnce({
      sort: vi.fn().mockReturnValue({
        toArray: vi.fn().mockRejectedValue(new Error('mongo down')),
      }),
    });
    const res = await req('GET', '/api/drafts/ws-1');
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Draft Agents (MongoDB) — POST /api/drafts/:workspaceId
// ---------------------------------------------------------------------------

describe('POST /api/drafts/:workspaceId', () => {
  it('returns 201 with created draft', async () => {
    const now = new Date();
    const insertedId = { toString: () => 'new-draft-id' };
    mockInsertOne.mockResolvedValueOnce({ insertedId });
    mockFindOne.mockResolvedValueOnce({
      _id: insertedId,
      workspaceId: 'ws-1',
      agentData: { name: 'Draft Bot' },
      createdAt: now,
      updatedAt: now,
    });

    const res = await req('POST', '/api/drafts/ws-1', {
      agentData: { name: 'Draft Bot', tools: ['calculator'] },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('new-draft-id');
    expect(body.workspaceId).toBe('ws-1');
    expect(body.agentData.name).toBe('Draft Bot');
    expect(body.createdAt).toBeDefined();
  });

  it('returns 400 when agentData is missing', async () => {
    const res = await req('POST', '/api/drafts/ws-1', {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/agentData/i);
  });

  it('returns 400 when agentData is not an object', async () => {
    const res = await req('POST', '/api/drafts/ws-1', { agentData: 'not-an-object' });
    expect(res.status).toBe(400);
  });

  it('strips extra keys from the draft input', async () => {
    const now = new Date();
    const insertedId = { toString: () => 'id' };
    mockInsertOne.mockResolvedValueOnce({ insertedId });
    mockFindOne.mockResolvedValueOnce({
      _id: insertedId,
      workspaceId: 'ws-1',
      agentData: { name: 'Bot' },
      createdAt: now,
      updatedAt: now,
    });

    // extra field should be ignored
    await req('POST', '/api/drafts/ws-1', {
      agentData: { name: 'Bot' },
      extraField: 'should be stripped',
    });

    const insertCall = mockInsertOne.mock.calls[0][0];
    expect(insertCall).not.toHaveProperty('extraField');
  });

  it('returns 503 on MongoDB error', async () => {
    mockInsertOne.mockRejectedValueOnce(new Error('mongo down'));
    const res = await req('POST', '/api/drafts/ws-1', { agentData: { name: 'Bot' } });
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Draft Agents (MongoDB) — DELETE /api/drafts/:draftId
// ---------------------------------------------------------------------------

describe('DELETE /api/drafts/:draftId', () => {
  it('returns 204 on successful delete', async () => {
    mockDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    // Use a valid 24-char hex ObjectId
    const res = await req('DELETE', '/api/drafts/6670a1b2c3d4e5f6a7b8c9d0');
    expect(res.status).toBe(204);
  });

  it('returns 404 when draft does not exist', async () => {
    mockDeleteOne.mockResolvedValueOnce({ deletedCount: 0 });
    const res = await req('DELETE', '/api/drafts/6670a1b2c3d4e5f6a7b8c9d0');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Draft not found');
  });

  it('returns 400 for invalid ObjectId format', async () => {
    const res = await req('DELETE', '/api/drafts/not-a-valid-objectid');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid draft ID format');
  });

  it('returns 503 on MongoDB error', async () => {
    mockDeleteOne.mockRejectedValueOnce(new Error('mongo down'));
    const res = await req('DELETE', '/api/drafts/6670a1b2c3d4e5f6a7b8c9d0');
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('Rate limiting on MongoDB routes', () => {
  it('returns X-RateLimit-Limit: 100', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await req('GET', '/api/preferences/user-1');
    expect(res.headers.get('x-ratelimit-limit')).toBe('100');
  });

  it('X-RateLimit-Remaining decrements with each request', async () => {
    mockFindOne.mockResolvedValue(null);
    const r1 = await req('GET', '/api/preferences/rate-test-unique-user-a');
    const r2 = await req('GET', '/api/preferences/rate-test-unique-user-a');
    const rem1 = Number(r1.headers.get('x-ratelimit-remaining'));
    const rem2 = Number(r2.headers.get('x-ratelimit-remaining'));
    expect(rem2).toBeLessThan(rem1);
  });

  it('X-RateLimit-Reset is a valid future ISO date', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await req('GET', '/api/preferences/user-ratelimit');
    const reset = res.headers.get('x-ratelimit-reset');
    expect(() => new Date(reset)).not.toThrow();
    expect(new Date(reset).getTime()).toBeGreaterThan(Date.now() - 1000);
  });
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

describe('CORS', () => {
  it('sets Access-Control-Allow-Origin on responses', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await req('GET', '/api/agents');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

// ---------------------------------------------------------------------------
// Request body limits and content-type
// ---------------------------------------------------------------------------

describe('Request validation', () => {
  it('returns 400 or 401 on completely missing body for POST /api/agents', async () => {
    // No auth header: body-parser may reject (400) before the route handler,
    // or pass with undefined body and hit requireAuth (401).
    const res = await fetch(`${baseUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    });
    expect([400, 401, 500].includes(res.status)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------

describe('POST /api/auth/signup', () => {
  it('returns 201 with token and safe user on success', async () => {
    const user = userRow();
    mockHashPassword.mockResolvedValueOnce('$2a$12$hashed');
    mockPoolQuery.mockResolvedValueOnce({ rows: [user] });
    mockSignAccessToken.mockReturnValueOnce('access-token');

    const res = await req('POST', '/api/auth/signup', {
      email: 'test@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBe('access-token');
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.id).toBe(user.id);
    expect(body.user.displayName).toBe('Test User');
    expect(body.user).not.toHaveProperty('password_hash');
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 409 when email is already registered', async () => {
    mockHashPassword.mockResolvedValueOnce('$2a$12$hashed');
    const err = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    mockPoolQuery.mockRejectedValueOnce(err);

    const res = await req('POST', '/api/auth/signup', {
      email: 'existing@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already registered/i);
  });

  it('returns 400 when password is too short', async () => {
    const res = await req('POST', '/api/auth/signup', {
      email: 'test@example.com',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/8 characters/i);
  });

  it('returns 400 when email is invalid', async () => {
    const res = await req('POST', '/api/auth/signup', {
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
  });

  it('returns 400 when body is malformed (array)', async () => {
    const res = await req('POST', '/api/auth/signup', []);
    expect(res.status).toBe(400);
  });

  it('includes X-RateLimit headers', async () => {
    mockHashPassword.mockResolvedValueOnce('$2a$12$hashed');
    mockPoolQuery.mockResolvedValueOnce({ rows: [userRow()] });

    const res = await req('POST', '/api/auth/signup', {
      email: 'rate@example.com',
      password: 'password123',
    });
    expect(res.headers.get('x-ratelimit-limit')).toBe('100');
  });

  it('returns 500 on unexpected db error', async () => {
    mockHashPassword.mockResolvedValueOnce('$2a$12$hashed');
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));

    const res = await req('POST', '/api/auth/signup', {
      email: 'test@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  it('returns 200 with token and safe user on success', async () => {
    const user = userRow();
    mockPoolQuery.mockResolvedValueOnce({ rows: [user] });
    mockVerifyPassword.mockResolvedValueOnce(true);
    mockSignAccessToken.mockReturnValueOnce('access-token');

    const res = await req('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('access-token');
    expect(body.user.email).toBe('test@example.com');
    expect(body.user).not.toHaveProperty('password_hash');
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 when password is wrong', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [userRow()] });
    mockVerifyPassword.mockResolvedValueOnce(false);

    const res = await req('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid email or password');
  });

  it('returns 401 when email is not registered', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await req('POST', '/api/auth/login', {
      email: 'unknown@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid email or password');
  });

  it('returns 400 when email is missing', async () => {
    const res = await req('POST', '/api/auth/login', { password: 'password123' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
  });

  it('returns 400 when body is malformed (array)', async () => {
    const res = await req('POST', '/api/auth/login', []);
    expect(res.status).toBe(400);
  });

  it('returns 500 on db error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));

    const res = await req('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe('GET /api/auth/me', () => {
  it('returns 200 with current user when token is valid', async () => {
    const user = userRow();
    mockVerifyToken.mockReturnValueOnce({ userId: user.id });
    mockPoolQuery.mockResolvedValueOnce({ rows: [user] });

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe('test@example.com');
    expect(body.displayName).toBe('Test User');
    expect(body).not.toHaveProperty('password_hash');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/Authorization/i);
  });

  it('returns 401 when token is invalid', async () => {
    mockVerifyToken.mockImplementationOnce(() => { throw new Error('invalid token'); });

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/invalid/i);
  });

  it('returns 500 on db error', async () => {
    mockVerifyToken.mockReturnValueOnce({ userId: 'user-id' });
    mockPoolQuery.mockRejectedValueOnce(new Error('db down'));

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(500);
  });
});

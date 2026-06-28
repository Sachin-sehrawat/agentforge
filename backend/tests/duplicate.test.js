/**
 * Integration tests for POST /api/agents/:id/duplicate
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
const SOURCE_ID     = 'cccccccc-0000-0000-0000-000000000001';
const COPY_ID       = 'dddddddd-0000-0000-0000-000000000001';

function sourceAgentRow(overrides = {}) {
  return {
    id: SOURCE_ID,
    name: 'My Agent',
    persona: 'Helpful assistant',
    system_prompt: 'Be helpful',
    model: 'claude-sonnet-4-6',
    tools: ['calculator'],
    positions: { calculator: { x: 10, y: 20 } },
    skills: [],
    instructions: ['Follow all safety guidelines'],
    tags: ['productivity'],
    owner_id: OWNER_ID,
    visibility: 'private',
    fork_count: 0,
    forked_from: null,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function copyAgentRow(overrides = {}) {
  return {
    id: COPY_ID,
    name: 'My Agent (copy)',
    persona: 'Helpful assistant',
    system_prompt: 'Be helpful',
    model: 'claude-sonnet-4-6',
    tools: ['calculator'],
    positions: { calculator: { x: 10, y: 20 } },
    skills: [],
    instructions: ['Follow all safety guidelines'],
    tags: ['productivity'],
    owner_id: OWNER_ID,
    visibility: 'private',
    fork_count: 0,
    forked_from: null,
    created_at: new Date('2024-06-01T00:00:00Z'),
    updated_at: new Date('2024-06-01T00:00:00Z'),
    ...overrides,
  };
}

async function authDuplicate(sourceId = SOURCE_ID, userId = OWNER_ID) {
  mockVerifyToken.mockReturnValueOnce({ userId });
  return fetch(`${baseUrl}/api/agents/${sourceId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
  });
}

// Sequence of mockClientQuery responses for a happy-path duplicate:
// BEGIN, SELECT * agents, INSERT agents, INSERT agent_versions, COMMIT
function mockHappyPath(copyRow = copyAgentRow()) {
  mockClientQuery
    .mockResolvedValueOnce({})                          // BEGIN
    .mockResolvedValueOnce({ rows: [sourceAgentRow()] }) // SELECT source
    .mockResolvedValueOnce({ rows: [copyRow] })          // INSERT new agent
    .mockResolvedValueOnce({})                           // INSERT agent_versions
    .mockResolvedValueOnce({});                          // COMMIT
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agents/:id/duplicate', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/agents/${SOURCE_ID}/duplicate`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when agent does not exist', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})          // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT source → not found
      .mockResolvedValueOnce({});         // ROLLBACK

    const res = await authDuplicate();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 403 when caller is not the owner', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})  // BEGIN
      .mockResolvedValueOnce({ rows: [sourceAgentRow({ owner_id: OTHER_USER_ID })] })
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await authDuplicate(SOURCE_ID, OWNER_ID);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
  });

  it('returns 201 with the new agent on happy path', async () => {
    mockHappyPath();

    const res = await authDuplicate();
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.name).toBe('My Agent (copy)');
    expect(body.ownerId).toBe(OWNER_ID);
    expect(body.visibility).toBe('private');
    expect(body.forkedFrom).toBeNull();
  });

  it('copy is independent: forkedFrom is null and no forked_from in INSERT', async () => {
    mockHappyPath();

    await authDuplicate();

    // call[2] is the INSERT (after BEGIN and SELECT)
    const insertCall = mockClientQuery.mock.calls[2];
    const [sql] = insertCall;
    expect(sql).not.toMatch(/forked_from/i);
  });

  it('deep-copies all fields including tags into the INSERT params', async () => {
    mockHappyPath();

    await authDuplicate();

    const insertCall = mockClientQuery.mock.calls[2];
    const params = insertCall[1];
    expect(params[1]).toBe('My Agent (copy)');                       // name
    expect(JSON.parse(params[5])).toContain('calculator');           // tools
    expect(JSON.parse(params[9])).toContain('productivity');         // tags
    expect(params[11]).toBe(OWNER_ID);                               // owner_id
  });

  it('inserts an initial version snapshot for the copy', async () => {
    mockHappyPath();

    await authDuplicate();

    const versionCall = mockClientQuery.mock.calls.find(
      ([sql]) => sql.includes('agent_versions')
    );
    expect(versionCall).toBeDefined();
    const params = versionCall[1];
    expect(params[0]).toMatch(/^[0-9a-f-]{36}$/); // agent_id is a UUID
    expect(params[3]).toMatch(SOURCE_ID);           // change_summary references source
    expect(params[4]).toBe(OWNER_ID);               // created_by
  });
});

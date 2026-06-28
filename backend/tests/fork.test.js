/**
 * Integration tests for POST /api/agents/:id/fork
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

const TEST_USER_ID  = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const SOURCE_ID     = 'cccccccc-0000-0000-0000-000000000001';
const FORK_ID       = 'dddddddd-0000-0000-0000-000000000001';
const SKILL_ID      = 'eeeeeeee-0000-0000-0000-000000000001';

function sourceAgentRow(overrides = {}) {
  return {
    id: SOURCE_ID,
    name: 'Public Agent',
    persona: 'Helpful assistant',
    system_prompt: 'Be helpful',
    model: 'claude-sonnet-4-6',
    tools: ['calculator'],
    positions: { calculator: { x: 10, y: 20 } },
    skills: [],
    instructions: ['Follow all safety guidelines'],
    owner_id: OTHER_USER_ID,
    visibility: 'public',
    fork_count: 3,
    forked_from: null,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function forkedAgentRow(overrides = {}) {
  return {
    id: FORK_ID,
    name: 'Public Agent (fork)',
    persona: 'Helpful assistant',
    system_prompt: 'Be helpful',
    model: 'claude-sonnet-4-6',
    tools: ['calculator'],
    positions: { calculator: { x: 10, y: 20 } },
    skills: [],
    instructions: ['Follow all safety guidelines'],
    owner_id: TEST_USER_ID,
    visibility: 'private',
    fork_count: 0,
    forked_from: SOURCE_ID,
    created_at: new Date('2024-06-01T00:00:00Z'),
    updated_at: new Date('2024-06-01T00:00:00Z'),
    ...overrides,
  };
}

async function authFork(sourceId = SOURCE_ID) {
  mockVerifyToken.mockReturnValueOnce({ userId: TEST_USER_ID });
  return fetch(`${baseUrl}/api/agents/${sourceId}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test-token' },
  });
}

// Sequence of mockClientQuery responses for a happy-path fork (no skills):
// BEGIN, SELECT * agents, INSERT agents, UPDATE fork_count, INSERT agent_versions, COMMIT
function mockHappyPath(forkRow = forkedAgentRow()) {
  mockClientQuery
    .mockResolvedValueOnce({})                       // BEGIN
    .mockResolvedValueOnce({ rows: [sourceAgentRow()] }) // SELECT source
    .mockResolvedValueOnce({ rows: [forkRow] })      // INSERT new agent
    .mockResolvedValueOnce({ rowCount: 1 })          // UPDATE fork_count
    .mockResolvedValueOnce({})                       // INSERT agent_versions
    .mockResolvedValueOnce({});                      // COMMIT
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/agents/:id/fork', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/agents/${SOURCE_ID}/fork`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when source agent does not exist', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})         // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT source → not found
      .mockResolvedValueOnce({});        // ROLLBACK

    const res = await authFork();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 403 when source is private and not owned by caller', async () => {
    mockClientQuery
      .mockResolvedValueOnce({})  // BEGIN
      .mockResolvedValueOnce({ rows: [sourceAgentRow({ visibility: 'private', owner_id: OTHER_USER_ID })] })
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await authFork();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
  });

  it('allows forking own private agent', async () => {
    const ownedSource = sourceAgentRow({ visibility: 'private', owner_id: TEST_USER_ID });
    const forkRow = forkedAgentRow({ owner_id: TEST_USER_ID });

    mockClientQuery
      .mockResolvedValueOnce({})                        // BEGIN
      .mockResolvedValueOnce({ rows: [ownedSource] })   // SELECT source
      .mockResolvedValueOnce({ rows: [forkRow] })       // INSERT new agent
      .mockResolvedValueOnce({ rowCount: 1 })           // UPDATE fork_count
      .mockResolvedValueOnce({})                        // INSERT agent_versions
      .mockResolvedValueOnce({});                       // COMMIT

    const res = await authFork();
    expect(res.status).toBe(201);
  });

  it('creates a fork with correct provenance fields', async () => {
    mockHappyPath();

    const res = await authFork();
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.name).toBe('Public Agent (fork)');
    expect(body.ownerId).toBe(TEST_USER_ID);
    expect(body.visibility).toBe('private');
    expect(body.forkedFrom).toBe(SOURCE_ID);
    expect(body.skillWarnings).toEqual([]);
  });

  it('passes deep-copied fields to the INSERT', async () => {
    mockHappyPath();

    await authFork();

    // mockClientQuery call[2] is the INSERT (after BEGIN and SELECT)
    const insertCall = mockClientQuery.mock.calls[2];
    const params = insertCall[1];
    expect(params[1]).toBe('Public Agent (fork)'); // name
    expect(params[9]).toBe(TEST_USER_ID);          // owner_id
    expect(params[10]).toBe(SOURCE_ID);            // forked_from
    const insertedTools = JSON.parse(params[5]);
    expect(insertedTools).toContain('calculator');
  });

  it('increments fork_count on the source in the same transaction', async () => {
    mockHappyPath();

    await authFork();

    const updateCall = mockClientQuery.mock.calls.find(
      ([sql]) => sql.includes('fork_count = fork_count + 1')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toEqual([SOURCE_ID]);
  });

  it('inserts an initial version snapshot for the fork', async () => {
    mockHappyPath();

    await authFork();

    const versionCall = mockClientQuery.mock.calls.find(
      ([sql]) => sql.includes('agent_versions')
    );
    expect(versionCall).toBeDefined();
    // params: [newId, canonical_hash, snapshot, change_summary, created_by]
    // version_no is the SQL literal 1, not a parameter
    const params = versionCall[1];
    expect(typeof params[0]).toBe('string');
    expect(params[0]).toMatch(/^[0-9a-f-]{36}$/); // agent_id is a UUID
    expect(params[3]).toMatch(SOURCE_ID);           // change_summary includes source id
  });

  it('includes skillWarnings for private unresolvable skills', async () => {
    const sourceWithSkill = sourceAgentRow({ skills: [SKILL_ID] });
    const forkRow = forkedAgentRow({ skills: [SKILL_ID] });

    mockClientQuery
      .mockResolvedValueOnce({})                          // BEGIN
      .mockResolvedValueOnce({ rows: [sourceWithSkill] }) // SELECT source
      .mockResolvedValueOnce({ rows: [] })                // SELECT accessible skills → none
      .mockResolvedValueOnce({ rows: [forkRow] })         // INSERT new agent
      .mockResolvedValueOnce({ rowCount: 1 })             // UPDATE fork_count
      .mockResolvedValueOnce({})                          // INSERT agent_versions
      .mockResolvedValueOnce({});                         // COMMIT

    const res = await authFork();
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.skillWarnings).toContain(SKILL_ID);
  });

  it('omits skillWarnings when all skills are accessible', async () => {
    const sourceWithSkill = sourceAgentRow({ skills: [SKILL_ID] });
    const forkRow = forkedAgentRow({ skills: [SKILL_ID] });

    mockClientQuery
      .mockResolvedValueOnce({})                          // BEGIN
      .mockResolvedValueOnce({ rows: [sourceWithSkill] }) // SELECT source
      .mockResolvedValueOnce({ rows: [{ id: SKILL_ID }] }) // SELECT accessible skills → found
      .mockResolvedValueOnce({ rows: [forkRow] })         // INSERT new agent
      .mockResolvedValueOnce({ rowCount: 1 })             // UPDATE fork_count
      .mockResolvedValueOnce({})                          // INSERT agent_versions
      .mockResolvedValueOnce({});                         // COMMIT

    const res = await authFork();
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.skillWarnings).toEqual([]);
  });
});

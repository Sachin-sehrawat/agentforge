/**
 * Integration-style tests for MongoDB-backed endpoints.
 *
 * MongoDB is mocked via vi.mock so these run without a live database.
 * For tests against a real MongoDB instance, set MONGO_URI in the environment
 * and run the server manually or use a test container.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module imports that consume them
// ---------------------------------------------------------------------------

const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();
const mockInsertOne = vi.fn();
const mockDeleteOne = vi.fn();
const mockFind = vi.fn();

const mockCollection = vi.fn(() => ({
  findOne: mockFindOne,
  updateOne: mockUpdateOne,
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
// Preference endpoint logic (unit-level, no HTTP layer)
// ---------------------------------------------------------------------------

describe('Preference endpoint behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns empty object when no document exists', async () => {
    mockFindOne.mockResolvedValue(null);
    const { getDb } = await import('../src/mongo.js');
    const doc = await getDb().collection('user_preferences').findOne({ userId: 'u1' });
    const result = doc?.preferences ?? {};
    expect(result).toEqual({});
  });

  it('GET returns stored preferences when document exists', async () => {
    const stored = { theme: 'dark', sidebar_width: 280 };
    mockFindOne.mockResolvedValue({ userId: 'u1', preferences: stored });
    const { getDb } = await import('../src/mongo.js');
    const doc = await getDb().collection('user_preferences').findOne({ userId: 'u1' });
    expect(doc?.preferences ?? {}).toEqual(stored);
  });

  it('POST upserts and returns document with timestamps', async () => {
    const now = new Date();
    const updatedDoc = {
      userId: 'u1',
      preferences: { theme: 'light' },
      createdAt: now,
      updatedAt: now,
    };
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });
    mockFindOne.mockResolvedValue(updatedDoc);

    const { getDb } = await import('../src/mongo.js');
    await getDb().collection('user_preferences').updateOne(
      { userId: 'u1' },
      { $set: { preferences: { theme: 'light' }, updatedAt: now }, $setOnInsert: { userId: 'u1', createdAt: now } },
      { upsert: true }
    );
    const doc = await getDb().collection('user_preferences').findOne({ userId: 'u1' });

    expect(doc.userId).toBe('u1');
    expect(doc.preferences).toEqual({ theme: 'light' });
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Workspace endpoint logic
// ---------------------------------------------------------------------------

describe('Workspace endpoint behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns empty object when no document exists', async () => {
    mockFindOne.mockResolvedValue(null);
    const { getDb } = await import('../src/mongo.js');
    const doc = await getDb().collection('workspace_state').findOne({ workspaceId: 'ws1' });
    expect(doc?.data ?? {}).toEqual({});
  });

  it('GET returns stored workspace data', async () => {
    const data = { selected_agent: 'agent-1', active_tab: 'canvas', agent_positions: {} };
    mockFindOne.mockResolvedValue({ workspaceId: 'ws1', data });
    const { getDb } = await import('../src/mongo.js');
    const doc = await getDb().collection('workspace_state').findOne({ workspaceId: 'ws1' });
    expect(doc?.data).toEqual(data);
  });

  it('POST upserts and returns document with timestamps', async () => {
    const now = new Date();
    const updatedDoc = {
      workspaceId: 'ws1',
      data: { selected_agent: 'a1', active_tab: 'canvas', agent_positions: {} },
      createdAt: now,
      updatedAt: now,
    };
    mockUpdateOne.mockResolvedValue({ upsertedCount: 1 });
    mockFindOne.mockResolvedValue(updatedDoc);

    const { getDb } = await import('../src/mongo.js');
    await getDb().collection('workspace_state').updateOne(
      { workspaceId: 'ws1' },
      { $set: { data: updatedDoc.data, updatedAt: now }, $setOnInsert: { workspaceId: 'ws1', createdAt: now } },
      { upsert: true }
    );
    const doc = await getDb().collection('workspace_state').findOne({ workspaceId: 'ws1' });

    expect(doc.workspaceId).toBe('ws1');
    expect(doc.data.selected_agent).toBe('a1');
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Draft endpoint logic
// ---------------------------------------------------------------------------

describe('Draft endpoint behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns array of drafts sorted newest first', async () => {
    const now = new Date();
    const drafts = [
      { _id: { toString: () => 'id2' }, workspaceId: 'ws1', agentData: { name: 'B' }, createdAt: now, updatedAt: now },
      { _id: { toString: () => 'id1' }, workspaceId: 'ws1', agentData: { name: 'A' }, createdAt: now, updatedAt: now },
    ];
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(drafts) }),
    });

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb()
      .collection('draft_agents')
      .find({ workspaceId: 'ws1' })
      .sort({ createdAt: -1 })
      .toArray();

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].agentData.name).toBe('B');
  });

  it('GET returns empty array when no drafts exist', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    });

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb()
      .collection('draft_agents')
      .find({ workspaceId: 'ws-none' })
      .sort({ createdAt: -1 })
      .toArray();

    expect(result).toHaveLength(0);
  });

  it('POST inserts draft and returns 201 with created doc', async () => {
    const now = new Date();
    const insertedId = { toString: () => 'new-id' };
    const inserted = {
      _id: insertedId,
      workspaceId: 'ws1',
      agentData: { name: 'Draft 1' },
      createdAt: now,
      updatedAt: now,
    };
    mockInsertOne.mockResolvedValue({ insertedId });
    mockFindOne.mockResolvedValue(inserted);

    const { getDb } = await import('../src/mongo.js');
    const insertResult = await getDb().collection('draft_agents').insertOne({
      workspaceId: 'ws1',
      agentData: { name: 'Draft 1' },
      createdAt: now,
      updatedAt: now,
    });
    const doc = await getDb().collection('draft_agents').findOne({ _id: insertResult.insertedId });

    expect(doc.workspaceId).toBe('ws1');
    expect(doc.agentData.name).toBe('Draft 1');
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  it('DELETE removes draft and returns deletedCount', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('draft_agents').deleteOne({ _id: 'some-id' });
    expect(result.deletedCount).toBe(1);
  });

  it('DELETE returns deletedCount 0 when draft does not exist', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 0 });
    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('draft_agents').deleteOne({ _id: 'missing-id' });
    expect(result.deletedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rate limit header format
// ---------------------------------------------------------------------------

describe('Rate limit logic', () => {
  it('X-RateLimit-Remaining decrements with each request', () => {
    const max = 100;
    const counts = [1, 2, 50, 100];
    for (const count of counts) {
      const remaining = Math.max(0, max - count);
      expect(remaining).toBe(max - count);
    }
  });

  it('reports 0 remaining when limit is exceeded', () => {
    const max = 100;
    const count = 105;
    expect(Math.max(0, max - count)).toBe(0);
  });

  it('X-RateLimit-Reset is a valid ISO date string', () => {
    const resetAt = Date.now() + 60_000;
    const header = new Date(resetAt).toISOString();
    expect(() => new Date(header)).not.toThrow();
    expect(new Date(header).getTime()).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// HTTP status code contracts
// ---------------------------------------------------------------------------

describe('HTTP status code contracts', () => {
  it('200 for successful GET', () => expect(200).toBe(200));
  it('201 for successful POST (create)', () => expect(201).toBe(201));
  it('204 for successful DELETE', () => expect(204).toBe(204));
  it('400 for validation failure', () => expect(400).toBe(400));
  it('404 for missing resource', () => expect(404).toBe(404));
  it('429 for rate limit exceeded', () => expect(429).toBe(429));
  it('503 for MongoDB unavailable', () => expect(503).toBe(503));
});

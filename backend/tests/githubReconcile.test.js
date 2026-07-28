import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockWithClient = vi.fn((fn) => fn({ query: mockQuery }));
vi.mock('../src/db.js', () => ({
  default: { query: (...args) => mockQuery(...args) },
  withClient: (...args) => mockWithClient(...args),
}));

const mockDecryptToken = vi.fn(() => 'plain-token');
const mockGetFileContents = vi.fn();
vi.mock('../src/integrations/github.js', () => ({
  decryptToken: (...args) => mockDecryptToken(...args),
  getFileContents: (...args) => mockGetFileContents(...args),
}));

vi.mock('../src/worker.js', () => ({
  registerHandler: vi.fn(),
}));

function testRenderPath(pathTemplate, agent) {
  const slug = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || agent.id;
  return pathTemplate.replace('{slug}', slug);
}
vi.mock('../src/githubSync.js', () => ({
  renderPath: (...args) => testRenderPath(...args),
}));

const { handleGithubReconcile } = await import('../src/githubReconcile.js');

const syncConfig = {
  repo_full_name: 'acme/agents-repo',
  branch: 'main',
  path_template: 'agents/{slug}.json',
  last_synced_commit_sha: 'old-sha',
  last_synced_version_no: 2,
};
const agent = {
  id: 'agent-1',
  owner_id: 'user-1',
  name: 'Test Agent',
  persona: '',
  system_prompt: 'Be helpful.',
  model: 'claude-sonnet-4-6',
  tools: [],
  skills: [],
  instructions: [],
  tags: [],
  positions: {},
};

function jsonFor(overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    name: 'Test Agent',
    persona: '',
    systemPrompt: 'Be helpful.',
    model: 'claude-sonnet-4-6',
    tools: [],
    skills: [],
    instructions: [],
    tags: [],
    positions: {},
    ...overrides,
  });
}

describe('handleGithubReconcile', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] }); // fallback for any call beyond the queued sequence
    mockWithClient.mockClear();
    mockDecryptToken.mockReset().mockReturnValue('plain-token');
    mockGetFileContents.mockReset();
  });

  it('no-ops when the sync config was removed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await handleGithubReconcile({ agentId: 'agent-1', commitSha: 'new-sha' }, { attemptNo: 1, maxAttempts: 3 });
    expect(mockGetFileContents).not.toHaveBeenCalled();
  });

  it('skips when the commit matches AgentForge\'s own last push (loop prevention)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [syncConfig] });
    await handleGithubReconcile({ agentId: 'agent-1', commitSha: 'old-sha' }, { attemptNo: 1, maxAttempts: 3 });
    expect(mockGetFileContents).not.toHaveBeenCalled();
  });

  it('no-ops when the agent no longer exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [] });
    await handleGithubReconcile({ agentId: 'agent-1', commitSha: 'new-sha' }, { attemptNo: 1, maxAttempts: 3 });
    expect(mockGetFileContents).not.toHaveBeenCalled();
  });

  it('skips when the file no longer exists at that commit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] });
    mockGetFileContents.mockResolvedValueOnce(null);
    await handleGithubReconcile({ agentId: 'agent-1', commitSha: 'new-sha' }, { attemptNo: 1, maxAttempts: 3 });
    expect(mockQuery.mock.calls.some(([sql]) => sql?.includes?.('UPDATE agents'))).toBe(false);
  });

  it('records an error status when GitHub is not connected, and still throws for retry', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [] }) // no github_connections
      .mockResolvedValueOnce({ rows: [] }); // markSyncStatus update
    await expect(
      handleGithubReconcile({ agentId: 'agent-1', commitSha: 'new-sha' }, { attemptNo: 3, maxAttempts: 3 })
    ).rejects.toThrow("GitHub is not connected");
    const errUpdate = mockQuery.mock.calls.find(([sql]) => sql.includes("last_sync_status = $"));
    expect(errUpdate).toBeTruthy();
  });

  it('treats identical content as a no-op sync (records commit, no version insert)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] })
      .mockResolvedValueOnce({ rows: [] }); // markSyncStatus update
    mockGetFileContents.mockResolvedValueOnce({ sha: 'blob1', content: jsonFor({ systemPrompt: 'Be helpful.' }) });

    await handleGithubReconcile({ agentId: 'agent-1', commitSha: 'new-sha' }, { attemptNo: 1, maxAttempts: 3 });

    expect(mockQuery.mock.calls.some(([sql]) => sql?.includes?.('INSERT INTO agent_versions'))).toBe(false);
    expect(mockWithClient).not.toHaveBeenCalled();
    const statusUpdate = mockQuery.mock.calls.find(([sql]) => sql.includes('last_sync_status'));
    expect(statusUpdate[1]).toContain('ok');
  });

  it('applies a clean update when local has not diverged since the last sync', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] })
      .mockResolvedValueOnce({ rows: [{ version_no: 2 }] }) // latest version matches last_synced_version_no
      .mockResolvedValueOnce({ rows: [] }) // github_login lookup (no pusherLogin passed, skipped actually)
      .mockResolvedValueOnce({ rows: [] }); // markSyncStatus update
    mockGetFileContents.mockResolvedValueOnce({
      sha: 'blob2',
      content: jsonFor({ systemPrompt: 'Updated from GitHub.' }),
    });

    await handleGithubReconcile({ agentId: 'agent-1', commitSha: 'new-sha', pusherLogin: 'octocat' }, { attemptNo: 1, maxAttempts: 3 });

    expect(mockWithClient).toHaveBeenCalledTimes(1);
    const updateCall = mockQuery.mock.calls.find(([sql]) => sql.includes('UPDATE agents'));
    expect(updateCall[1]).toContain('Updated from GitHub.');
    const versionInsert = mockQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO agent_versions'));
    expect(versionInsert[1][4]).toContain('Synced from GitHub commit');
    const statusUpdate = mockQuery.mock.calls.find(([sql]) => sql.includes('UPDATE agent_github_sync') && sql.includes('last_synced_version_no'));
    expect(statusUpdate[1]).toContain(3); // nextNo = latestVersionNo(2) + 1
  });

  it('flags a conflict instead of applying when local has diverged since the last sync', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] }) // last_synced_version_no: 2
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] })
      .mockResolvedValueOnce({ rows: [{ version_no: 5 }] }) // local moved on (5 !== 2) → diverged
      .mockResolvedValueOnce({ rows: [] }) // INSERT agent_versions (conflict row)
      .mockResolvedValueOnce({ rows: [] }); // markSyncStatus update

    mockGetFileContents.mockResolvedValueOnce({
      sha: 'blob3',
      content: jsonFor({ systemPrompt: 'Conflicting GitHub edit.' }),
    });

    await handleGithubReconcile({ agentId: 'agent-1', commitSha: 'new-sha' }, { attemptNo: 1, maxAttempts: 3 });

    expect(mockWithClient).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([sql]) => sql?.includes?.('UPDATE agents'))).toBe(false);
    const versionInsert = mockQuery.mock.calls.find(([sql]) => sql.includes('INSERT INTO agent_versions'));
    expect(versionInsert[1][4]).toBe('GitHub conflict — review required');
    const statusUpdate = mockQuery.mock.calls.find(([sql]) => sql.includes('last_sync_status'));
    expect(statusUpdate[1]).toContain('conflict');
  });

  it('marks a parse error status without throwing (not retryable)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] })
      .mockResolvedValueOnce({ rows: [] }); // markSyncStatus update
    mockGetFileContents.mockResolvedValueOnce({ sha: 'blob4', content: 'not valid json {' });

    await handleGithubReconcile({ agentId: 'agent-1', commitSha: 'new-sha' }, { attemptNo: 1, maxAttempts: 3 });

    const statusUpdate = mockQuery.mock.calls.find(([sql]) => sql.includes('last_sync_status'));
    expect(statusUpdate[1].some((v) => typeof v === 'string' && v.includes('Could not parse'))).toBe(true);
  });
});

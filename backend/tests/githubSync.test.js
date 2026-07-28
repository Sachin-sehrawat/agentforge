import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../src/db.js', () => ({
  default: { query: (...args) => mockQuery(...args) },
}));

const mockDecryptToken = vi.fn(() => 'plain-token');
const mockGetFileContents = vi.fn();
const mockPutFileContents = vi.fn();
vi.mock('../src/integrations/github.js', () => ({
  decryptToken: (...args) => mockDecryptToken(...args),
  getFileContents: (...args) => mockGetFileContents(...args),
  putFileContents: (...args) => mockPutFileContents(...args),
}));

vi.mock('../src/worker.js', () => ({
  registerHandler: vi.fn(),
}));

const { handleGithubSync, renderPath } = await import('../src/githubSync.js');

describe('renderPath', () => {
  it('slugifies the agent name into the {slug} placeholder', () => {
    expect(renderPath('agents/{slug}.json', { id: 'x', name: 'My Cool Agent!' })).toBe(
      'agents/my-cool-agent.json'
    );
  });

  it('falls back to the agent id when the name has no alphanumerics', () => {
    expect(renderPath('agents/{slug}.json', { id: 'fallback-id', name: '!!!' })).toBe(
      'agents/fallback-id.json'
    );
  });
});

describe('handleGithubSync', () => {
  const agent = {
    id: 'agent-1',
    owner_id: 'user-1',
    name: 'Test Agent',
    persona: '',
    system_prompt: '',
    model: 'claude-sonnet-4-6',
    tools: [],
    skills: [],
    instructions: [],
    tags: [],
    positions: {},
  };
  const syncConfig = {
    agent_id: 'agent-1',
    repo_full_name: 'acme/agents-repo',
    branch: 'main',
    path_template: 'agents/{slug}.json',
    auto_sync: true,
    format: 'json',
  };

  beforeEach(() => {
    mockQuery.mockReset();
    mockDecryptToken.mockReset().mockReturnValue('plain-token');
    mockGetFileContents.mockReset();
    mockPutFileContents.mockReset();
  });

  it('no-ops when the sync config was removed before the job ran', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // agent_github_sync lookup
    await handleGithubSync({ agentId: 'agent-1' }, { attemptNo: 1, maxAttempts: 3 });
    expect(mockPutFileContents).not.toHaveBeenCalled();
  });

  it('no-ops when the agent no longer exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [] }); // agents lookup
    await handleGithubSync({ agentId: 'agent-1' }, { attemptNo: 1, maxAttempts: 3 });
    expect(mockPutFileContents).not.toHaveBeenCalled();
  });

  it('records an actionable error when GitHub is not connected', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [] }) // github_connections lookup — none
      .mockResolvedValueOnce({ rows: [] }); // markSyncError UPDATE
    await handleGithubSync({ agentId: 'agent-1' }, { attemptNo: 1, maxAttempts: 3 });
    expect(mockPutFileContents).not.toHaveBeenCalled();
    const errorUpdateCall = mockQuery.mock.calls.find(([sql]) => sql.includes("last_sync_status = 'error'"));
    expect(errorUpdateCall[1][0]).toContain('not connected');
  });

  it('creates the file when none exists yet and records success', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] })
      .mockResolvedValueOnce({ rows: [{ version_no: 3, change_summary: '' }] })
      .mockResolvedValueOnce({ rows: [] }); // success UPDATE
    mockGetFileContents.mockResolvedValueOnce(null);
    mockPutFileContents.mockResolvedValueOnce({ commitSha: 'commit-abc', contentSha: 'blob-1' });

    await handleGithubSync({ agentId: 'agent-1' }, { attemptNo: 1, maxAttempts: 3 });

    expect(mockPutFileContents).toHaveBeenCalledWith(
      'plain-token', 'acme', 'agents-repo', 'agents/test-agent.json',
      expect.stringContaining('"name": "Test Agent"'),
      expect.stringContaining('v3'),
      undefined,
      'main'
    );
    const successUpdate = mockQuery.mock.calls.find(([sql]) => sql.includes("last_sync_status = 'ok'"));
    expect(successUpdate[1]).toEqual(['commit-abc', 3, 'agent-1']);
  });

  it('updates the existing file using its sha', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] })
      .mockResolvedValueOnce({ rows: [] }) // no version rows yet
      .mockResolvedValueOnce({ rows: [] }); // success UPDATE
    mockGetFileContents.mockResolvedValueOnce({ sha: 'existing-sha', content: '{}' });
    mockPutFileContents.mockResolvedValueOnce({ commitSha: 'commit-2', contentSha: 'blob-2' });

    await handleGithubSync({ agentId: 'agent-1' }, { attemptNo: 1, maxAttempts: 3 });

    expect(mockPutFileContents).toHaveBeenCalledWith(
      'plain-token', 'acme', 'agents-repo', 'agents/test-agent.json',
      expect.any(String), expect.any(String), 'existing-sha', 'main'
    );
  });

  it('marks a permanent error only on the final retry attempt, and always rethrows', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] })
      .mockResolvedValueOnce({ rows: [{ version_no: 1 }] });
    mockGetFileContents.mockRejectedValueOnce(new Error('network down'));

    await expect(
      handleGithubSync({ agentId: 'agent-1' }, { attemptNo: 1, maxAttempts: 3 })
    ).rejects.toThrow('network down');
    expect(mockQuery.mock.calls.some(([sql]) => sql?.includes?.("last_sync_status = 'error'"))).toBe(false);
  });

  it('marks the sync as errored on the final attempt', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [syncConfig] })
      .mockResolvedValueOnce({ rows: [agent] })
      .mockResolvedValueOnce({ rows: [{ access_token_encrypted: Buffer.from('enc') }] })
      .mockResolvedValueOnce({ rows: [{ version_no: 1 }] })
      .mockResolvedValueOnce({ rows: [] }); // markSyncError UPDATE
    mockGetFileContents.mockRejectedValueOnce(new Error('network down'));

    await expect(
      handleGithubSync({ agentId: 'agent-1' }, { attemptNo: 3, maxAttempts: 3 })
    ).rejects.toThrow('network down');
    const errorUpdate = mockQuery.mock.calls.find(([sql]) => sql.includes("last_sync_status = 'error'"));
    expect(errorUpdate[1]).toEqual(['network down', 'agent-1']);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFileContents, putFileContents } from '../src/integrations/github.js';

describe('getFileContents', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns decoded content and sha for an existing file', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        sha: 'abc123',
        encoding: 'base64',
        content: Buffer.from('{"name":"Test"}').toString('base64'),
      }),
    });
    const result = await getFileContents('token', 'acme', 'agents-repo', 'agents/test.json', 'main');
    expect(result).toEqual({ sha: 'abc123', content: '{"name":"Test"}' });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/agents-repo/contents/agents/test.json?ref=main');
  });

  it('encodes each path segment separately so slashes are preserved', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ sha: 's', encoding: 'base64', content: Buffer.from('x').toString('base64') }),
    });
    await getFileContents('token', 'acme', 'repo', 'a b/c.json');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('/contents/a%20b/c.json');
  });

  it('returns null when the file does not exist (404)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await getFileContents('token', 'acme', 'repo', 'agents/missing.json');
    expect(result).toBeNull();
  });

  it('throws on other HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(getFileContents('token', 'acme', 'repo', 'agents/x.json')).rejects.toThrow(
      'GitHub file fetch HTTP error: 500'
    );
  });
});

describe('putFileContents', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends base64-encoded content and returns commit/content shas', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ commit: { sha: 'commit1' }, content: { sha: 'blob1' } }),
    });
    const result = await putFileContents(
      'token', 'acme', 'repo', 'agents/test.json', '{"a":1}', 'AgentForge sync', 'oldsha', 'main'
    );
    expect(result).toEqual({ commitSha: 'commit1', contentSha: 'blob1' });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/repo/contents/agents/test.json');
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body.content).toBe(Buffer.from('{"a":1}').toString('base64'));
    expect(body.sha).toBe('oldsha');
    expect(body.branch).toBe('main');
    expect(body.message).toBe('AgentForge sync');
  });

  it('omits sha from the request body when creating a new file', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ commit: { sha: 'commit1' }, content: { sha: 'blob1' } }),
    });
    await putFileContents('token', 'acme', 'repo', 'agents/new.json', '{}', 'create', undefined, 'main');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('sha');
  });

  it('throws with response detail on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, text: async () => 'sha mismatch' });
    await expect(
      putFileContents('token', 'acme', 'repo', 'agents/x.json', '{}', 'msg', 'sha', 'main')
    ).rejects.toThrow('GitHub file write HTTP error: 409 — sha mismatch');
  });
});

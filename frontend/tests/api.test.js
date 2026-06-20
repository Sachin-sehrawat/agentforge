import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, _clearCache, setToken, onUnauthorized } from '../src/api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(body, status = 200) {
  return { ok: true, status, json: async () => body };
}

function err(body, status) {
  return { ok: false, status, json: async () => body };
}

function networkError() {
  return Promise.reject(new Error('Network error'));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  _clearCache();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tools API
// ---------------------------------------------------------------------------

describe('Tools API', () => {
  it('fetches tools list', async () => {
    const tools = [{ id: 'calculator', label: 'Calculator', kind: 'client' }];
    global.fetch.mockResolvedValue(ok(tools));

    const result = await api.getTools();

    expect(result).toEqual(tools);
    expect(global.fetch).toHaveBeenCalledWith('/api/tools', expect.any(Object));
  });

  it('throws on network failure', async () => {
    global.fetch.mockRejectedValue(new Error('Network failed'));
    await expect(api.getTools()).rejects.toThrow('Network failed');
  });
});

// ---------------------------------------------------------------------------
// Agents API
// ---------------------------------------------------------------------------

describe('Agents API', () => {
  it('fetches all agents', async () => {
    const agents = [{ id: '1', name: 'Agent 1' }];
    global.fetch.mockResolvedValue(ok(agents));

    const result = await api.listAgents();
    expect(result).toEqual(agents);
  });

  it('fetches single agent by id', async () => {
    const agent = { id: 'abc', name: 'Test', tools: [] };
    global.fetch.mockResolvedValue(ok(agent));

    const result = await api.getAgent('abc');
    expect(result).toEqual(agent);
    expect(global.fetch).toHaveBeenCalledWith('/api/agents/abc', expect.any(Object));
  });

  it('creates an agent via POST', async () => {
    const created = { id: 'new-id', name: 'Bot', tools: [] };
    global.fetch.mockResolvedValue(ok(created, 201));

    const result = await api.createAgent({ name: 'Bot', tools: [] });
    expect(result).toEqual(created);
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ name: 'Bot' });
  });

  it('deletes an agent and returns null on 204', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 204, json: async () => null });

    const result = await api.deleteAgent('abc');
    expect(result).toBeNull();
  });

  it('throws on 404 when agent not found', async () => {
    global.fetch.mockResolvedValue(err({ error: 'Agent not found' }, 404));
    await expect(api.getAgent('missing')).rejects.toThrow('Agent not found');
  });
});

// ---------------------------------------------------------------------------
// User Preferences (MongoDB)
// ---------------------------------------------------------------------------

describe('getUserPreferences', () => {
  it('fetches preferences from API on cache miss', async () => {
    global.fetch.mockResolvedValue(ok({ theme: 'dark', sidebar_width: 300 }));

    const result = await api.getUserPreferences('user-1');

    expect(result.theme).toBe('dark');
    expect(result.sidebar_width).toBe(300);
    expect(global.fetch).toHaveBeenCalledWith('/api/preferences/user-1', expect.any(Object));
  });

  it('merges API response with defaults for missing fields', async () => {
    global.fetch.mockResolvedValue(ok({ theme: 'dark' }));

    const result = await api.getUserPreferences('user-1');

    expect(result.theme).toBe('dark');
    expect(result.canvas_zoom).toBe(1);
    expect(result.canvas_pan).toEqual({ x: 0, y: 0 });
    expect(result.sidebar_width).toBe(280);
  });

  it('returns defaults without calling fetch again on cache hit', async () => {
    global.fetch.mockResolvedValue(ok({ theme: 'dark' }));

    await api.getUserPreferences('user-1');
    const result = await api.getUserPreferences('user-1');

    expect(result.theme).toBe('dark');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to defaults when API fails (503 / network)', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    const result = await api.getUserPreferences('user-1');

    expect(result).toMatchObject({
      theme: 'system',
      canvas_zoom: 1,
      canvas_pan: { x: 0, y: 0 },
      sidebar_width: 280,
    });
  });

  it('falls back to defaults on 503 MongoDB unavailable', async () => {
    global.fetch.mockResolvedValue(err({ error: 'MongoDB unavailable' }, 503));

    const result = await api.getUserPreferences('user-1');

    expect(result.theme).toBe('system');
  });
});

describe('saveUserPreferences', () => {
  it('throws immediately on invalid theme without calling fetch', async () => {
    await expect(api.saveUserPreferences('user-1', { theme: 'midnight' })).rejects.toThrow(
      'theme must be one of: light, dark, system'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws on canvas_zoom out of range', async () => {
    await expect(api.saveUserPreferences('user-1', { canvas_zoom: 99 })).rejects.toThrow(
      'canvas_zoom must be a number between 0.1 and 5'
    );
  });

  it('throws on canvas_pan missing y', async () => {
    await expect(api.saveUserPreferences('user-1', { canvas_pan: { x: 1 } })).rejects.toThrow(
      'canvas_pan must be an object with numeric x and y'
    );
  });

  it('throws on sidebar_width out of range', async () => {
    await expect(api.saveUserPreferences('user-1', { sidebar_width: 9999 })).rejects.toThrow(
      'sidebar_width must be a number between 0 and 2000'
    );
  });

  it('throws on non-object preferences', async () => {
    await expect(api.saveUserPreferences('user-1', null)).rejects.toThrow(
      'Preferences must be a non-null object'
    );
  });

  it('updates cache optimistically before server responds', async () => {
    let resolveRequest;
    global.fetch.mockReturnValue(
      new Promise((res) => {
        resolveRequest = () => res(ok({ preferences: { theme: 'dark' } }));
      })
    );

    const savePromise = api.saveUserPreferences('user-1', { theme: 'dark' });

    // While save is in-flight, prefetch should return optimistic value
    global.fetch.mockResolvedValueOnce(ok({ theme: 'light' }));
    // But cache should already reflect 'dark' — no second fetch needed
    const cached = await api.getUserPreferences('user-1');
    expect(cached.theme).toBe('dark');
    expect(global.fetch).toHaveBeenCalledTimes(1); // only the save call, GET was served from cache

    resolveRequest();
    await savePromise;
  });

  it('sends preferences to correct endpoint via POST', async () => {
    global.fetch.mockResolvedValue(ok({ preferences: { theme: 'light' } }));

    await api.saveUserPreferences('user-1', { theme: 'light' });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/preferences/user-1');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ theme: 'light' });
  });

  it('updates cache with server-confirmed preferences after save', async () => {
    global.fetch.mockResolvedValue(ok({ preferences: { theme: 'dark', sidebar_width: 320 } }));

    await api.saveUserPreferences('user-1', { theme: 'dark', sidebar_width: 320 });

    // Second call should use cache — no additional fetch
    global.fetch.mockRejectedValue(new Error('should not be called'));
    const cached = await api.getUserPreferences('user-1');
    expect(cached.theme).toBe('dark');
    expect(cached.sidebar_width).toBe(320);
  });

  it('reverts cache to previous state when all retries fail', async () => {
    vi.useFakeTimers();

    // Pre-populate cache with existing preferences
    global.fetch.mockResolvedValueOnce(ok({ theme: 'light' }));
    await api.getUserPreferences('user-1');

    // Now fail every save attempt
    global.fetch.mockRejectedValue(new Error('Network error'));

    const savePromise = api.saveUserPreferences('user-1', { theme: 'dark' });
    savePromise.catch(() => {}); // prevent unhandled rejection warning during timer advance
    await vi.runAllTimersAsync();
    await expect(savePromise).rejects.toThrow('Failed to save preferences');

    // Cache should be restored to light (no additional network call needed)
    global.fetch.mockResolvedValue(ok({ theme: 'should-not-be-called' }));
    const cached = await api.getUserPreferences('user-1');
    expect(cached.theme).toBe('light');
    expect(global.fetch).toHaveBeenCalledTimes(1 + 3); // 1 GET + 3 retry attempts
  });

  it('retries exactly 3 times on network failure', async () => {
    vi.useFakeTimers();
    global.fetch.mockRejectedValue(new Error('Network error'));

    const savePromise = api.saveUserPreferences('user-1', { theme: 'dark' });
    savePromise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(savePromise).rejects.toThrow();

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('succeeds on third attempt after two failures', async () => {
    vi.useFakeTimers();
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(ok({ preferences: { theme: 'dark' } }));

    const savePromise = api.saveUserPreferences('user-1', { theme: 'dark' });
    await vi.runAllTimersAsync();
    const result = await savePromise;

    expect(result).toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 400 validation error from server', async () => {
    global.fetch.mockResolvedValue(err({ error: 'Invalid theme' }, 400));

    await expect(api.saveUserPreferences('user-1', { theme: 'dark' })).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Workspace State (MongoDB)
// ---------------------------------------------------------------------------

describe('getWorkspaceData', () => {
  it('fetches workspace data on cache miss', async () => {
    const data = { selected_agent: 'agent-1', active_tab: 'canvas' };
    global.fetch.mockResolvedValue(ok(data));

    const result = await api.getWorkspaceData('ws-1');

    expect(result).toEqual(data);
    expect(global.fetch).toHaveBeenCalledWith('/api/workspace/ws-1', expect.any(Object));
  });

  it('serves from cache on second call', async () => {
    global.fetch.mockResolvedValue(ok({ active_tab: 'canvas' }));

    await api.getWorkspaceData('ws-1');
    await api.getWorkspaceData('ws-1');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to {} on API failure', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    const result = await api.getWorkspaceData('ws-1');
    expect(result).toEqual({});
  });
});

describe('saveWorkspaceData', () => {
  it('saves data to correct endpoint', async () => {
    const payload = { selected_agent: 'a1', active_tab: 'settings' };
    global.fetch.mockResolvedValue(ok({ workspaceId: 'ws-1', data: payload }));

    await api.saveWorkspaceData('ws-1', payload);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/workspace/ws-1');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(payload);
  });

  it('caches server-confirmed data after save', async () => {
    const serverData = { selected_agent: 'a1', active_tab: 'canvas' };
    global.fetch.mockResolvedValue(ok({ data: serverData, updatedAt: '2024-01-01T00:00:00Z' }));

    await api.saveWorkspaceData('ws-1', { selected_agent: 'a1', active_tab: 'canvas' });

    global.fetch.mockRejectedValue(new Error('should not be called'));
    const cached = await api.getWorkspaceData('ws-1');
    expect(cached).toEqual(serverData);
  });

  it('updates cache optimistically before server responds', async () => {
    let resolve;
    global.fetch.mockReturnValue(new Promise((r) => { resolve = r; }));

    api.saveWorkspaceData('ws-1', { active_tab: 'settings' });

    // Cache should reflect new value immediately (no second fetch call)
    const cached = await api.getWorkspaceData('ws-1');
    expect(cached.active_tab).toBe('settings');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolve(ok({ data: { active_tab: 'settings' } }));
  });

  it('reverts cache on persistent failure', async () => {
    vi.useFakeTimers();

    // Pre-populate cache
    global.fetch.mockResolvedValueOnce(ok({ active_tab: 'canvas' }));
    await api.getWorkspaceData('ws-1');

    global.fetch.mockRejectedValue(new Error('Network error'));
    const savePromise = api.saveWorkspaceData('ws-1', { active_tab: 'settings' });
    savePromise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(savePromise).rejects.toThrow('Failed to save workspace');

    // Cached value should be restored
    global.fetch.mockResolvedValue(ok({ active_tab: 'should-not-be-called' }));
    const cached = await api.getWorkspaceData('ws-1');
    expect(cached.active_tab).toBe('canvas');
  });

  it('detects conflict when expectedUpdatedAt does not match last saved timestamp', async () => {
    // First save establishes the server timestamp
    global.fetch.mockResolvedValue(
      ok({ data: {}, updatedAt: '2024-06-01T12:00:00Z' })
    );
    await api.saveWorkspaceData('ws-1', { active_tab: 'canvas' });

    // Second save with a stale expectedUpdatedAt should throw conflict
    await expect(
      api.saveWorkspaceData('ws-1', { active_tab: 'settings' }, {
        expectedUpdatedAt: '2024-01-01T00:00:00Z',
      })
    ).rejects.toThrow('Conflict: workspace data was modified since your last save');

    // fetch should not have been called for the conflicted save
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('allows save when expectedUpdatedAt matches last known timestamp', async () => {
    const updatedAt = '2024-06-01T12:00:00Z';
    global.fetch
      .mockResolvedValueOnce(ok({ data: {}, updatedAt }))
      .mockResolvedValueOnce(ok({ data: { active_tab: 'settings' }, updatedAt: '2024-06-01T13:00:00Z' }));

    await api.saveWorkspaceData('ws-1', { active_tab: 'canvas' });
    const result = await api.saveWorkspaceData(
      'ws-1',
      { active_tab: 'settings' },
      { expectedUpdatedAt: updatedAt }
    );

    expect(result).toBeDefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries 3 times on server error', async () => {
    vi.useFakeTimers();
    global.fetch.mockRejectedValue(new Error('Network error'));

    const savePromise = api.saveWorkspaceData('ws-1', { active_tab: 'canvas' });
    savePromise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(savePromise).rejects.toThrow();

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Draft Agents (MongoDB)
// ---------------------------------------------------------------------------

describe('getDraftAgents', () => {
  it('fetches drafts from correct endpoint', async () => {
    const drafts = [{ id: 'draft-1', agentData: { name: 'Bot' } }];
    global.fetch.mockResolvedValue(ok(drafts));

    const result = await api.getDraftAgents('ws-1');

    expect(result).toEqual(drafts);
    expect(global.fetch).toHaveBeenCalledWith('/api/drafts/ws-1', expect.any(Object));
  });

  it('serves from cache on second call', async () => {
    global.fetch.mockResolvedValue(ok([]));

    await api.getDraftAgents('ws-1');
    await api.getDraftAgents('ws-1');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to [] on API failure', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    const result = await api.getDraftAgents('ws-1');
    expect(result).toEqual([]);
  });

  it('falls back to [] on 503 MongoDB unavailable', async () => {
    global.fetch.mockResolvedValue(err({ error: 'MongoDB unavailable' }, 503));

    const result = await api.getDraftAgents('ws-1');
    expect(result).toEqual([]);
  });
});

describe('saveDraftAgent', () => {
  it('posts agentData to workspace-scoped endpoint', async () => {
    const draft = { id: 'draft-id', agentData: { name: 'Bot' } };
    global.fetch.mockResolvedValue(ok(draft, 201));

    const result = await api.saveDraftAgent('ws-1', { name: 'Bot', tools: [] });

    expect(result).toEqual(draft);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/drafts/ws-1');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ agentData: { name: 'Bot', tools: [] } });
  });

  it('invalidates drafts cache after successful save', async () => {
    // Populate cache
    global.fetch.mockResolvedValueOnce(ok([{ id: 'old' }]));
    await api.getDraftAgents('ws-1');

    // Save new draft (cache should be invalidated)
    global.fetch.mockResolvedValueOnce(ok({ id: 'new-draft' }, 201));
    await api.saveDraftAgent('ws-1', { name: 'New Bot' });

    // Next GET should call fetch again (cache was cleared)
    global.fetch.mockResolvedValueOnce(ok([{ id: 'new-draft' }]));
    await api.getDraftAgents('ws-1');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries up to 3 times on network failure', async () => {
    vi.useFakeTimers();
    global.fetch.mockRejectedValue(new Error('Network error'));

    const savePromise = api.saveDraftAgent('ws-1', { name: 'Bot' });
    savePromise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(savePromise).rejects.toThrow('Failed to save draft');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('succeeds on retry after initial failure', async () => {
    vi.useFakeTimers();
    const draft = { id: 'draft-id', agentData: { name: 'Bot' } };
    global.fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(ok(draft, 201));

    const savePromise = api.saveDraftAgent('ws-1', { name: 'Bot' });
    await vi.runAllTimersAsync();
    const result = await savePromise;

    expect(result).toEqual(draft);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('deleteDraftAgent', () => {
  it('sends DELETE to draft-id endpoint', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 204, json: async () => null });

    await api.deleteDraftAgent('6670a1b2c3d4e5f6a7b8c9d0');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/drafts/6670a1b2c3d4e5f6a7b8c9d0');
    expect(opts.method).toBe('DELETE');
  });

  it('invalidates all drafts caches after deletion', async () => {
    // Populate caches for two workspaces
    global.fetch.mockResolvedValueOnce(ok([{ id: 'a' }]));
    global.fetch.mockResolvedValueOnce(ok([{ id: 'b' }]));
    await api.getDraftAgents('ws-1');
    await api.getDraftAgents('ws-2');

    // Delete a draft
    global.fetch.mockResolvedValue({ ok: true, status: 204, json: async () => null });
    await api.deleteDraftAgent('draft-abc');

    // Both workspace draft caches should be cleared → fresh GETs
    global.fetch.mockResolvedValue(ok([]));
    await api.getDraftAgents('ws-1');
    await api.getDraftAgents('ws-2');

    expect(global.fetch).toHaveBeenCalledTimes(2 + 1 + 2); // 2 GETs + 1 DELETE + 2 GETs
  });

  it('throws with friendly message on 404', async () => {
    global.fetch.mockResolvedValue(err({ error: 'Draft not found' }, 404));

    await expect(api.deleteDraftAgent('missing')).rejects.toThrow('Failed to delete draft');
  });

  it('throws with friendly message on 400 invalid id', async () => {
    global.fetch.mockResolvedValue(err({ error: 'Invalid draft ID format' }, 400));

    await expect(api.deleteDraftAgent('bad-id')).rejects.toThrow('Failed to delete draft');
  });

  it('throws on network failure', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    await expect(api.deleteDraftAgent('draft-1')).rejects.toThrow('Failed to delete draft');
  });
});

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

describe('Auth API — token attachment', () => {
  it('sends Authorization header when token is set', async () => {
    setToken('my-token');
    global.fetch.mockResolvedValue(ok([]));

    await api.getTools();

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer my-token');
  });

  it('omits Authorization header when no token is set', async () => {
    global.fetch.mockResolvedValue(ok([]));

    await api.getTools();

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });

  it('_clearCache resets token so subsequent requests carry no Authorization', async () => {
    setToken('token-to-clear');
    _clearCache();
    global.fetch.mockResolvedValue(ok([]));

    await api.getTools();

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });
});

describe('Auth API — signup / login / me / logout', () => {
  it('api.signup posts to /auth/signup and returns token + user', async () => {
    const response = { token: 'jwt-token', user: { id: '1', email: 'a@b.com', displayName: 'Alice' } };
    global.fetch.mockResolvedValue(ok(response, 201));

    const result = await api.signup('a@b.com', 'password', 'Alice');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/auth/signup');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ email: 'a@b.com', password: 'password', display_name: 'Alice' });
    expect(result).toEqual(response);
  });

  it('api.signup throws on 409 duplicate email', async () => {
    global.fetch.mockResolvedValue(err({ error: 'Email address is already registered' }, 409));

    await expect(api.signup('dup@b.com', 'pass')).rejects.toThrow('Email address is already registered');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('api.login posts to /auth/login and returns token + user', async () => {
    const response = { token: 'jwt-token', user: { id: '1', email: 'a@b.com' } };
    global.fetch.mockResolvedValue(ok(response));

    const result = await api.login('a@b.com', 'password');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ email: 'a@b.com', password: 'password' });
    expect(result).toEqual(response);
  });

  it('api.login throws on 401 invalid credentials', async () => {
    global.fetch.mockResolvedValue(err({ error: 'Invalid email or password' }, 401));

    await expect(api.login('a@b.com', 'wrong')).rejects.toThrow('Invalid email or password');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('api.me sends GET to /auth/me with the current token', async () => {
    setToken('active-token');
    const user = { id: '1', email: 'a@b.com' };
    global.fetch.mockResolvedValue(ok(user));

    const result = await api.me();

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/auth/me');
    expect(opts.headers['Authorization']).toBe('Bearer active-token');
    expect(result).toEqual(user);
  });

  it('api.logout clears the in-memory token immediately', async () => {
    setToken('active-token');
    api.logout();

    global.fetch.mockResolvedValue(ok([]));
    await api.getTools();

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });
});

describe('Auth API — 401 global handling', () => {
  it('clears the token on any 401 response', async () => {
    setToken('expired-token');
    global.fetch.mockResolvedValue(err({ error: 'Unauthorized' }, 401));

    await expect(api.getTools()).rejects.toThrow();

    global.fetch.mockResolvedValue(ok([]));
    await api.getTools();
    const [, opts] = global.fetch.mock.calls[1];
    expect(opts.headers['Authorization']).toBeUndefined();
  });

  it('calls the onUnauthorized handler when a token was present', async () => {
    setToken('active-token');
    const handler = vi.fn();
    onUnauthorized(handler);
    global.fetch.mockResolvedValue(err({ error: 'Unauthorized' }, 401));

    await expect(api.getTools()).rejects.toThrow();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('does NOT call the onUnauthorized handler when no token was present', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    global.fetch.mockResolvedValue(err({ error: 'Invalid email or password' }, 401));

    await expect(api.login('a@b.com', 'wrong')).rejects.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });

  it('_clearCache resets the onUnauthorized handler between tests', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    _clearCache();

    setToken('some-token');
    global.fetch.mockResolvedValue(err({ error: 'Unauthorized' }, 401));

    await expect(api.getTools()).rejects.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

describe('Error Handling', () => {
  it('propagates server error message from JSON body', async () => {
    global.fetch.mockResolvedValue(err({ error: 'Something went wrong' }, 500));

    await expect(api.listAgents()).rejects.toThrow('Something went wrong');
  });

  it('falls back to generic message when error body is not JSON', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('Not JSON'); },
    });

    await expect(api.listAgents()).rejects.toThrow('Request failed (500)');
  });

  it('throws on network errors', async () => {
    global.fetch.mockRejectedValue(new Error('Network failed'));
    await expect(api.listAgents()).rejects.toThrow('Network failed');
  });
});

// ---------------------------------------------------------------------------
// Request format
// ---------------------------------------------------------------------------

describe('Request format', () => {
  it('sends Content-Type: application/json on every request', async () => {
    global.fetch.mockResolvedValue(ok([]));
    await api.listAgents();

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('prefixes all paths with /api', async () => {
    global.fetch.mockResolvedValue(ok([]));
    await api.listAgents();

    const [url] = global.fetch.mock.calls[0];
    expect(url).toMatch(/^\/api\//);
  });
});

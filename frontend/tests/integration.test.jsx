/**
 * Integration tests for React components and frontend-backend communication.
 *
 * Components are rendered with @testing-library/react in a jsdom environment.
 * The global fetch is mocked so no live backend is needed.
 * The api module cache is cleared between tests via _clearCache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import ErrorBoundary from '../src/components/ErrorBoundary.jsx';
import { api, _clearCache, setToken, onUnauthorized } from '../src/api.js';

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  _clearCache();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(body, status = 200) {
  return { ok: true, status, json: async () => body };
}

function err(body, status) {
  return { ok: false, status, json: async () => body };
}

// ---------------------------------------------------------------------------
// ErrorBoundary component
// ---------------------------------------------------------------------------

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function ThrowingComponent() {
      throw new Error('Render failed');
    }

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('renders custom message prop on error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function ThrowingComponent() {
      throw new Error('Boom');
    }

    render(
      <ErrorBoundary message="Custom error message">
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('calls componentDidCatch with error info', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const catchSpy = vi.spyOn(ErrorBoundary.prototype, 'componentDidCatch');

    function ThrowingComponent() {
      throw new Error('catch me');
    }

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(catchSpy).toHaveBeenCalledOnce();
    const [error] = catchSpy.mock.calls[0];
    expect(error.message).toBe('catch me');

    catchSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('resets error state when Try again button is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) throw new Error('Conditional error');
      return <div>Recovered content</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>
    );

    // Error UI is shown
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    // Fix the throwing condition and click Try again
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    rerender(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('wraps multiple children without error', () => {
    render(
      <ErrorBoundary>
        <span>A</span>
        <span>B</span>
        <span>C</span>
      </ErrorBoundary>
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders SVG error icon in fallback UI', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function ThrowingComponent() {
      throw new Error('Icon test');
    }

    const { container } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Frontend ↔ Backend communication: Agent API
// ---------------------------------------------------------------------------

describe('Agent API integration', () => {
  it('listAgents fetches and returns agents array', async () => {
    const agents = [
      { id: '1', name: 'Bot A', tools: [], model: 'claude-sonnet-4-6' },
      { id: '2', name: 'Bot B', tools: [], model: 'claude-sonnet-4-6' },
    ];
    global.fetch.mockResolvedValueOnce(ok(agents));

    const result = await api.listAgents();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Bot A');
    expect(global.fetch).toHaveBeenCalledWith('/api/agents', expect.any(Object));
  });

  it('createAgent sends POST and returns created agent', async () => {
    const created = { id: 'new-uuid', name: 'My Agent', tools: [] };
    global.fetch.mockResolvedValueOnce(ok(created, 201));

    const result = await api.createAgent({
      name: 'My Agent',
      systemPrompt: 'Be helpful',
      tools: ['calculator'],
    });

    expect(result.id).toBe('new-uuid');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/agents');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).name).toBe('My Agent');
  });

  it('updateAgent sends PUT with correct id', async () => {
    const updated = { id: 'abc', name: 'Updated', tools: [] };
    global.fetch.mockResolvedValueOnce(ok(updated));

    const result = await api.updateAgent('abc', { name: 'Updated' });

    expect(result.name).toBe('Updated');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/agents/abc');
    expect(opts.method).toBe('PUT');
  });

  it('deleteAgent sends DELETE and returns null', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });

    const result = await api.deleteAgent('abc');

    expect(result).toBeNull();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/agents/abc');
    expect(opts.method).toBe('DELETE');
  });

  it('getAgent fetches single agent by id', async () => {
    const agent = { id: 'abc', name: 'Specific Agent', tools: [] };
    global.fetch.mockResolvedValueOnce(ok(agent));

    const result = await api.getAgent('abc');

    expect(result.name).toBe('Specific Agent');
    expect(global.fetch).toHaveBeenCalledWith('/api/agents/abc', expect.any(Object));
  });

  it('throws with server error message on 4xx response', async () => {
    global.fetch.mockResolvedValueOnce(err({ error: 'Agent not found' }, 404));

    await expect(api.getAgent('missing')).rejects.toThrow('Agent not found');
  });

  it('throws with generic message when error body is not JSON', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    await expect(api.listAgents()).rejects.toThrow('Request failed (500)');
  });
});

// ---------------------------------------------------------------------------
// Frontend ↔ Backend communication: Skills API
// ---------------------------------------------------------------------------

describe('Skills API integration', () => {
  it('listSkills fetches skills array', async () => {
    const skills = [{ id: 's1', label: 'Skill A', instruction: 'Do A' }];
    global.fetch.mockResolvedValueOnce(ok(skills));

    const result = await api.listSkills();

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Skill A');
  });

  it('listPublicSkills calls /api/skills/public', async () => {
    const skills = [{ id: 's1', label: 'Skill A', instruction: 'Do A', isOwned: false }];
    global.fetch.mockResolvedValueOnce(ok(skills));

    const result = await api.listPublicSkills();

    expect(result).toHaveLength(1);
    expect(result[0].isOwned).toBe(false);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/skills/public');
  });

  it('listMySkills calls /api/skills/mine', async () => {
    const skills = [{ id: 's2', label: 'My Skill', instruction: 'Be helpful', isOwned: true }];
    global.fetch.mockResolvedValueOnce(ok(skills));

    const result = await api.listMySkills();

    expect(result).toHaveLength(1);
    expect(result[0].isOwned).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/skills/mine');
  });

  it('createSkill sends POST and returns created skill', async () => {
    const created = { id: 'skill-uuid', label: 'New Skill', instruction: 'Be useful' };
    global.fetch.mockResolvedValueOnce(ok(created, 201));

    const result = await api.createSkill({ label: 'New Skill', instruction: 'Be useful' });

    expect(result.id).toBe('skill-uuid');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/skills');
    expect(opts.method).toBe('POST');
  });

  it('updateSkill sends PUT to correct skill endpoint', async () => {
    const updated = { id: 's1', label: 'Updated Skill', instruction: 'New instruction' };
    global.fetch.mockResolvedValueOnce(ok(updated));

    await api.updateSkill('s1', { label: 'Updated Skill', instruction: 'New instruction' });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/skills/s1');
    expect(opts.method).toBe('PUT');
  });

  it('deleteSkill sends DELETE and returns null on 204', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });

    const result = await api.deleteSkill('s1');

    expect(result).toBeNull();
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
  });
});

// ---------------------------------------------------------------------------
// User Preferences integration (caching + fallback)
// ---------------------------------------------------------------------------

describe('User Preferences integration', () => {
  it('loads preferences and merges with defaults', async () => {
    global.fetch.mockResolvedValueOnce(ok({ theme: 'dark' }));

    const prefs = await api.getUserPreferences('user-1');

    expect(prefs.theme).toBe('dark');
    // Defaults for missing fields
    expect(prefs.canvas_zoom).toBe(1);
    expect(prefs.canvas_pan).toEqual({ x: 0, y: 0 });
    expect(prefs.sidebar_width).toBe(280);
  });

  it('returns cached preferences without a second fetch', async () => {
    global.fetch.mockResolvedValueOnce(ok({ theme: 'light' }));

    await api.getUserPreferences('user-1');
    const second = await api.getUserPreferences('user-1');

    expect(second.theme).toBe('light');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to defaults when server returns 503', async () => {
    global.fetch.mockResolvedValueOnce(err({ error: 'MongoDB unavailable' }, 503));

    const prefs = await api.getUserPreferences('user-1');

    expect(prefs.theme).toBe('system');
    expect(prefs.canvas_zoom).toBe(1);
  });

  it('falls back to defaults on network failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const prefs = await api.getUserPreferences('user-1');

    expect(prefs).toMatchObject({
      theme: 'system',
      canvas_zoom: 1,
      canvas_pan: { x: 0, y: 0 },
      sidebar_width: 280,
    });
  });

  it('saves preferences and updates cache', async () => {
    global.fetch.mockResolvedValueOnce(ok({ preferences: { theme: 'dark' } }));

    await api.saveUserPreferences('user-1', { theme: 'dark' });

    // Should read from cache — no additional fetch
    global.fetch.mockRejectedValue(new Error('should not be called'));
    const cached = await api.getUserPreferences('user-1');
    expect(cached.theme).toBe('dark');
  });

  it('rejects invalid theme before calling fetch', async () => {
    await expect(
      api.saveUserPreferences('user-1', { theme: 'invalid' })
    ).rejects.toThrow(/theme/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects sidebar_width > 2000', async () => {
    await expect(
      api.saveUserPreferences('user-1', { sidebar_width: 9999 })
    ).rejects.toThrow(/sidebar_width/i);
  });

  it('rejects canvas_zoom < 0.1', async () => {
    await expect(
      api.saveUserPreferences('user-1', { canvas_zoom: 0 })
    ).rejects.toThrow(/canvas_zoom/i);
  });

  it('rejects null preferences object', async () => {
    await expect(api.saveUserPreferences('user-1', null)).rejects.toThrow(/non-null object/i);
  });
});

// ---------------------------------------------------------------------------
// Workspace State integration
// ---------------------------------------------------------------------------

describe('Workspace State integration', () => {
  it('fetches workspace data on first call', async () => {
    const data = { selected_agent: 'agent-1', active_tab: 'canvas' };
    global.fetch.mockResolvedValueOnce(ok(data));

    const result = await api.getWorkspaceData('ws-1');

    expect(result.selected_agent).toBe('agent-1');
    expect(global.fetch).toHaveBeenCalledWith('/api/workspace/ws-1', expect.any(Object));
  });

  it('serves cached workspace data on second call', async () => {
    global.fetch.mockResolvedValueOnce(ok({ active_tab: 'settings' }));

    await api.getWorkspaceData('ws-1');
    await api.getWorkspaceData('ws-1');

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to empty object on API failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await api.getWorkspaceData('ws-1');
    expect(result).toEqual({});
  });

  it('saves workspace data and updates cache', async () => {
    const serverData = { selected_agent: 'a1', active_tab: 'canvas' };
    global.fetch.mockResolvedValueOnce(ok({ data: serverData, updatedAt: '2024-01-01T00:00:00Z' }));

    await api.saveWorkspaceData('ws-1', { selected_agent: 'a1', active_tab: 'canvas' });

    // Should serve from cache now
    global.fetch.mockRejectedValue(new Error('should not be called'));
    const cached = await api.getWorkspaceData('ws-1');
    expect(cached).toEqual(serverData);
  });

  it('detects conflict when expectedUpdatedAt is stale', async () => {
    global.fetch.mockResolvedValueOnce(
      ok({ data: {}, updatedAt: '2024-06-01T12:00:00Z' })
    );
    await api.saveWorkspaceData('ws-1', { active_tab: 'canvas' });

    await expect(
      api.saveWorkspaceData('ws-1', { active_tab: 'settings' }, {
        expectedUpdatedAt: '2024-01-01T00:00:00Z',
      })
    ).rejects.toThrow(/conflict/i);
  });
});

// ---------------------------------------------------------------------------
// Draft Agents integration
// ---------------------------------------------------------------------------

describe('Draft Agents integration', () => {
  it('fetches drafts for a workspace', async () => {
    const drafts = [{ id: 'd1', agentData: { name: 'Draft Bot' }, workspaceId: 'ws-1' }];
    global.fetch.mockResolvedValueOnce(ok(drafts));

    const result = await api.getDraftAgents('ws-1');

    expect(result).toHaveLength(1);
    expect(result[0].agentData.name).toBe('Draft Bot');
  });

  it('falls back to empty array on 503', async () => {
    global.fetch.mockResolvedValueOnce(err({ error: 'MongoDB unavailable' }, 503));

    const result = await api.getDraftAgents('ws-1');
    expect(result).toEqual([]);
  });

  it('falls back to empty array on network failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await api.getDraftAgents('ws-1');
    expect(result).toEqual([]);
  });

  it('saveDraftAgent sends agentData wrapped in body', async () => {
    const draft = { id: 'draft-id', agentData: { name: 'New Bot' } };
    global.fetch.mockResolvedValueOnce(ok(draft, 201));

    const result = await api.saveDraftAgent('ws-1', { name: 'New Bot', tools: [] });

    expect(result.id).toBe('draft-id');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/drafts/ws-1');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ agentData: { name: 'New Bot', tools: [] } });
  });

  it('saveDraftAgent invalidates cache so next getDraftAgents re-fetches', async () => {
    // Populate cache
    global.fetch.mockResolvedValueOnce(ok([{ id: 'old' }]));
    await api.getDraftAgents('ws-1');

    // Save invalidates cache
    global.fetch.mockResolvedValueOnce(ok({ id: 'new' }, 201));
    await api.saveDraftAgent('ws-1', { name: 'New' });

    // Next get must call fetch again
    global.fetch.mockResolvedValueOnce(ok([{ id: 'new' }]));
    await api.getDraftAgents('ws-1');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('deleteDraftAgent sends DELETE to correct url', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });

    await api.deleteDraftAgent('6670a1b2c3d4e5f6a7b8c9d0');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/drafts/6670a1b2c3d4e5f6a7b8c9d0');
    expect(opts.method).toBe('DELETE');
  });

  it('deleteDraftAgent clears all draft caches across workspaces', async () => {
    global.fetch.mockResolvedValueOnce(ok([{ id: 'a' }]));
    global.fetch.mockResolvedValueOnce(ok([{ id: 'b' }]));
    await api.getDraftAgents('ws-1');
    await api.getDraftAgents('ws-2');

    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    await api.deleteDraftAgent('6670a1b2c3d4e5f6a7b8c9d0');

    global.fetch.mockResolvedValue(ok([]));
    await api.getDraftAgents('ws-1');
    await api.getDraftAgents('ws-2');

    // 2 initial GETs + 1 DELETE + 2 re-fetches after cache clear
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it('deleteDraftAgent throws on 404', async () => {
    global.fetch.mockResolvedValueOnce(err({ error: 'Draft not found' }, 404));

    await expect(api.deleteDraftAgent('6670a1b2c3d4e5f6a7b8c9d0')).rejects.toThrow(
      'Failed to delete draft'
    );
  });
});

// ---------------------------------------------------------------------------
// Full agent lifecycle workflow
// ---------------------------------------------------------------------------

describe('Agent lifecycle workflow', () => {
  it('create → load → update → delete agent in sequence', async () => {
    // Step 1: Create
    const created = { id: 'uuid-1', name: 'My Agent', tools: ['calculator'], systemPrompt: '' };
    global.fetch.mockResolvedValueOnce(ok(created, 201));
    const agent = await api.createAgent({ name: 'My Agent', tools: ['calculator'] });
    expect(agent.id).toBe('uuid-1');

    // Step 2: Load
    global.fetch.mockResolvedValueOnce(ok(created));
    const loaded = await api.getAgent('uuid-1');
    expect(loaded.name).toBe('My Agent');
    expect(loaded.tools).toContain('calculator');

    // Step 3: Update
    const updated = { ...created, name: 'Renamed Agent' };
    global.fetch.mockResolvedValueOnce(ok(updated));
    const renamed = await api.updateAgent('uuid-1', { name: 'Renamed Agent' });
    expect(renamed.name).toBe('Renamed Agent');

    // Step 4: Delete
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    const deleteResult = await api.deleteAgent('uuid-1');
    expect(deleteResult).toBeNull();

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('save draft → retrieve draft → promote to saved agent', async () => {
    const agentData = { name: 'Draft Agent', tools: ['code_runner'], systemPrompt: 'Draft' };

    // Save draft
    const draft = { id: 'draft-1', agentData, workspaceId: 'ws-1' };
    global.fetch.mockResolvedValueOnce(ok(draft, 201));
    const saved = await api.saveDraftAgent('ws-1', agentData);
    expect(saved.id).toBe('draft-1');

    // Retrieve drafts
    global.fetch.mockResolvedValueOnce(ok([draft]));
    const drafts = await api.getDraftAgents('ws-1');
    expect(drafts[0].agentData.name).toBe('Draft Agent');

    // Promote: create a real agent from draft data
    const created = { id: 'real-agent-uuid', ...agentData };
    global.fetch.mockResolvedValueOnce(ok(created, 201));
    const realAgent = await api.createAgent(agentData);
    expect(realAgent.id).toBe('real-agent-uuid');

    // Delete draft
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    await api.deleteDraftAgent('draft-1');

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation
// ---------------------------------------------------------------------------

describe('Graceful degradation', () => {
  it('preferences API falls back to defaults when MongoDB is down', async () => {
    // Simulate MongoDB down (503)
    global.fetch.mockResolvedValue(err({ error: 'MongoDB unavailable' }, 503));

    const prefs = await api.getUserPreferences('user-1');

    // Should NOT throw; should return sensible defaults
    expect(prefs.theme).toBe('system');
    expect(prefs.canvas_zoom).toBe(1);
    expect(prefs.sidebar_width).toBe(280);
  });

  it('workspace API falls back to empty object when MongoDB is down', async () => {
    global.fetch.mockResolvedValue(err({ error: 'MongoDB unavailable' }, 503));

    const data = await api.getWorkspaceData('ws-1');
    expect(data).toEqual({});
  });

  it('drafts API falls back to empty array when MongoDB is down', async () => {
    global.fetch.mockResolvedValue(err({ error: 'MongoDB unavailable' }, 503));

    const drafts = await api.getDraftAgents('ws-1');
    expect(drafts).toEqual([]);
  });

  it('does not crash when multiple MongoDB endpoints fail simultaneously', async () => {
    global.fetch.mockResolvedValue(err({ error: 'Service unavailable' }, 503));

    const [prefs, workspace, drafts] = await Promise.all([
      api.getUserPreferences('user-1'),
      api.getWorkspaceData('ws-1'),
      api.getDraftAgents('ws-1'),
    ]);

    expect(prefs.theme).toBe('system');
    expect(workspace).toEqual({});
    expect(drafts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Request format validation
// ---------------------------------------------------------------------------

describe('Request format', () => {
  it('sends Content-Type: application/json on every request', async () => {
    global.fetch.mockResolvedValueOnce(ok([]));
    await api.listAgents();
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('prefixes all paths with /api', async () => {
    global.fetch.mockResolvedValueOnce(ok([]));
    await api.listAgents();
    const [url] = global.fetch.mock.calls[0];
    expect(url).toMatch(/^\/api\//);
  });

  it('sends JSON-serialized body for POST requests', async () => {
    global.fetch.mockResolvedValueOnce(ok({ id: '1', name: 'Bot', tools: [] }, 201));
    await api.createAgent({ name: 'Bot', tools: [] });
    const [, opts] = global.fetch.mock.calls[0];
    expect(() => JSON.parse(opts.body)).not.toThrow();
    expect(JSON.parse(opts.body).name).toBe('Bot');
  });
});

// ---------------------------------------------------------------------------
// Cache behavior
// ---------------------------------------------------------------------------

describe('Cache behavior', () => {
  it('caches different userIds independently', async () => {
    global.fetch
      .mockResolvedValueOnce(ok({ theme: 'dark' }))
      .mockResolvedValueOnce(ok({ theme: 'light' }));

    const p1 = await api.getUserPreferences('user-1');
    const p2 = await api.getUserPreferences('user-2');

    expect(p1.theme).toBe('dark');
    expect(p2.theme).toBe('light');
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Second fetch of each should use cache
    const p1cached = await api.getUserPreferences('user-1');
    const p2cached = await api.getUserPreferences('user-2');
    expect(p1cached.theme).toBe('dark');
    expect(p2cached.theme).toBe('light');
    expect(global.fetch).toHaveBeenCalledTimes(2); // still 2
  });

  it('caches different workspaceIds independently', async () => {
    global.fetch
      .mockResolvedValueOnce(ok({ active_tab: 'canvas' }))
      .mockResolvedValueOnce(ok({ active_tab: 'settings' }));

    const ws1 = await api.getWorkspaceData('ws-1');
    const ws2 = await api.getWorkspaceData('ws-2');

    expect(ws1.active_tab).toBe('canvas');
    expect(ws2.active_tab).toBe('settings');
  });

  it('_clearCache resets all cached data', async () => {
    global.fetch.mockResolvedValueOnce(ok({ theme: 'dark' }));
    await api.getUserPreferences('user-1');

    _clearCache();

    // After clearing, should fetch again
    global.fetch.mockResolvedValueOnce(ok({ theme: 'light' }));
    const result = await api.getUserPreferences('user-1');
    expect(result.theme).toBe('light');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// E2E: anonymous build → download
// ---------------------------------------------------------------------------

describe('E2E: anonymous build → download', () => {
  it('anonymous user saves agent config as draft and retrieves it', async () => {
    // No auth token — _clearCache already set _token = null
    const agentConfig = { name: 'Anon Bot', tools: ['calculator'], systemPrompt: 'Help me' };

    // Build step: save draft (no auth required for drafts)
    const draft = { id: 'draft-anon-1', agentData: agentConfig, workspaceId: 'ws-anon' };
    global.fetch.mockResolvedValueOnce(ok(draft, 201));
    const saved = await api.saveDraftAgent('ws-anon', agentConfig);
    expect(saved.id).toBe('draft-anon-1');
    expect(saved.agentData.name).toBe('Anon Bot');

    // No Authorization header was sent
    const [, saveOpts] = global.fetch.mock.calls[0];
    expect(saveOpts.headers['Authorization']).toBeUndefined();

    // Download step: retrieve draft and access agent config
    global.fetch.mockResolvedValueOnce(ok([draft]));
    const drafts = await api.getDraftAgents('ws-anon');
    expect(drafts).toHaveLength(1);

    const downloaded = drafts[0].agentData;
    expect(downloaded.name).toBe('Anon Bot');
    expect(downloaded.tools).toContain('calculator');
    expect(downloaded.systemPrompt).toBe('Help me');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('anonymous user cannot create a published agent without auth (401)', async () => {
    global.fetch.mockResolvedValueOnce(err({ error: 'Unauthorized' }, 401));

    await expect(
      api.createAgent({ name: 'Needs Auth Bot', tools: [] })
    ).rejects.toThrow('Unauthorized');

    // No auth header was present
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// E2E: anonymous save → login → save completes
// ---------------------------------------------------------------------------

describe('E2E: anonymous save → login → save completes', () => {
  it('unauthenticated save fails, login provides token, retry succeeds', async () => {
    // Step 1: Attempt to create agent without auth → 401
    global.fetch.mockResolvedValueOnce(err({ error: 'Unauthorized' }, 401));
    await expect(
      api.createAgent({ name: 'Deferred Agent', tools: [] })
    ).rejects.toThrow('Unauthorized');

    // No Authorization header on unauthenticated request
    const [, firstOpts] = global.fetch.mock.calls[0];
    expect(firstOpts.headers['Authorization']).toBeUndefined();

    // Step 2: User completes login via auth modal
    const user = { id: 'u1', email: 'user@example.com', display_name: 'User One' };
    global.fetch.mockResolvedValueOnce(ok({ token: 'jwt-xyz', user }));
    const loginResult = await api.login('user@example.com', 'pass123');
    expect(loginResult.token).toBe('jwt-xyz');
    setToken(loginResult.token);

    const [loginUrl, loginOpts] = global.fetch.mock.calls[1];
    expect(loginUrl).toBe('/api/auth/login');
    expect(loginOpts.method).toBe('POST');

    // Step 3: Retry save — now authenticated
    const created = { id: 'agent-deferred', name: 'Deferred Agent', tools: [] };
    global.fetch.mockResolvedValueOnce(ok(created, 201));
    const result = await api.createAgent({ name: 'Deferred Agent', tools: [] });
    expect(result.id).toBe('agent-deferred');

    // Authorization header present on authenticated retry
    const [, thirdOpts] = global.fetch.mock.calls[2];
    expect(thirdOpts.headers['Authorization']).toBe('Bearer jwt-xyz');

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('onUnauthorized fires when an existing session token is rejected', async () => {
    let loggedOut = false;
    onUnauthorized(() => { loggedOut = true; });
    setToken('stale-jwt');

    // Server rejects the stale token (session expired)
    global.fetch.mockResolvedValueOnce(err({ error: 'Token expired' }, 401));
    await expect(api.listMyAgents()).rejects.toThrow('Token expired');

    // Handler fired and token was cleared
    expect(loggedOut).toBe(true);

    // Subsequent request carries no auth header (token was nulled)
    global.fetch.mockResolvedValueOnce(ok([]));
    await api.listPublicAgents();
    const [, secondOpts] = global.fetch.mock.calls[1];
    expect(secondOpts.headers['Authorization']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// E2E: signup → create → publish → appears in public tab
// ---------------------------------------------------------------------------

describe('E2E: signup → create → publish → appears in public tab', () => {
  it('new user registers, creates agent, publishes it, and it appears publicly', async () => {
    // Step 1: Signup
    const user = { id: 'user-new', email: 'signup@example.com', display_name: 'New User' };
    global.fetch.mockResolvedValueOnce(ok({ token: 'jwt-new', user }, 201));
    const signupResult = await api.signup('signup@example.com', 'securepass', 'New User');
    expect(signupResult.token).toBe('jwt-new');
    expect(signupResult.user.id).toBe('user-new');
    setToken(signupResult.token);

    const [signupUrl, signupOpts] = global.fetch.mock.calls[0];
    expect(signupUrl).toBe('/api/auth/signup');
    expect(signupOpts.method).toBe('POST');
    expect(JSON.parse(signupOpts.body)).toMatchObject({
      email: 'signup@example.com',
      display_name: 'New User',
    });

    // Step 2: Create agent (private by default)
    const agent = { id: 'agent-pub', name: 'Community Bot', tools: [], visibility: 'private' };
    global.fetch.mockResolvedValueOnce(ok(agent, 201));
    const created = await api.createAgent({ name: 'Community Bot', tools: [] });
    expect(created.id).toBe('agent-pub');
    expect(created.visibility).toBe('private');

    // Step 3: Publish — toggle visibility to public
    const published = { ...agent, visibility: 'public' };
    global.fetch.mockResolvedValueOnce(ok(published));
    const toggled = await api.updateAgentVisibility('agent-pub', 'public');
    expect(toggled.visibility).toBe('public');

    const [patchUrl, patchOpts] = global.fetch.mock.calls[2];
    expect(patchUrl).toBe('/api/agents/agent-pub');
    expect(patchOpts.method).toBe('PATCH');
    expect(JSON.parse(patchOpts.body)).toEqual({ visibility: 'public' });

    // Step 4: Agent appears in public tab
    global.fetch.mockResolvedValueOnce(ok([published]));
    const publicAgents = await api.listPublicAgents();
    const found = publicAgents.find((a) => a.id === 'agent-pub');
    expect(found).toBeDefined();
    expect(found.visibility).toBe('public');
    expect(global.fetch.mock.calls[3][0]).toBe('/api/agents/public');

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('signup sends correct fields and token is usable for authenticated calls', async () => {
    const user = { id: 'u2', email: 'user2@example.com', display_name: 'User Two' };
    global.fetch.mockResolvedValueOnce(ok({ token: 'jwt-u2', user }, 201));
    const result = await api.signup('user2@example.com', 'pass', 'User Two');
    setToken(result.token);

    // Verify the token flows into subsequent requests
    global.fetch.mockResolvedValueOnce(ok([]));
    await api.listMyAgents();
    const [, opts] = global.fetch.mock.calls[1];
    expect(opts.headers['Authorization']).toBe('Bearer jwt-u2');
  });
});

// ---------------------------------------------------------------------------
// E2E: subscribe to public agent → appears in My Agents → unsubscribe
// ---------------------------------------------------------------------------

describe('E2E: subscribe to public → appears in My Agents → unsubscribe', () => {
  it('user subscribes to public agent, sees it in My Agents, then unsubscribes', async () => {
    setToken('jwt-subscriber');

    const publicAgent = {
      id: 'agent-popular',
      name: 'Popular Bot',
      visibility: 'public',
      isSubscribed: false,
    };

    // Step 1: Browse public agents
    global.fetch.mockResolvedValueOnce(ok([publicAgent]));
    const publicList = await api.listPublicAgents();
    expect(publicList).toHaveLength(1);
    expect(publicList[0].isSubscribed).toBe(false);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/agents/public');

    // Step 2: Subscribe
    global.fetch.mockResolvedValueOnce(ok({ userId: 'u-sub', agentId: 'agent-popular' }));
    const subResult = await api.subscribeAgent('agent-popular');
    expect(subResult.agentId).toBe('agent-popular');

    const [subUrl, subOpts] = global.fetch.mock.calls[1];
    expect(subUrl).toBe('/api/agents/agent-popular/subscribe');
    expect(subOpts.method).toBe('POST');

    // Step 3: Agent appears in My Agents as subscribed
    const subscribedAgent = { ...publicAgent, isSubscribed: true, isOwned: false };
    global.fetch.mockResolvedValueOnce(ok([subscribedAgent]));
    const myAgents = await api.listMyAgents();
    const found = myAgents.find((a) => a.id === 'agent-popular');
    expect(found).toBeDefined();
    expect(found.isSubscribed).toBe(true);
    expect(global.fetch.mock.calls[2][0]).toBe('/api/agents/mine');

    // Step 4: Unsubscribe
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    const unsubResult = await api.unsubscribeAgent('agent-popular');
    expect(unsubResult).toBeNull();

    const [unsubUrl, unsubOpts] = global.fetch.mock.calls[3];
    expect(unsubUrl).toBe('/api/agents/agent-popular/subscribe');
    expect(unsubOpts.method).toBe('DELETE');

    // Step 5: My Agents no longer includes the unsubscribed agent
    global.fetch.mockResolvedValueOnce(ok([]));
    const myAgentsAfter = await api.listMyAgents();
    expect(myAgentsAfter.find((a) => a.id === 'agent-popular')).toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it('subscribing to a non-existent agent throws 404', async () => {
    setToken('jwt-subscriber');
    global.fetch.mockResolvedValueOnce(err({ error: 'Agent not found' }, 404));

    await expect(api.subscribeAgent('no-such-agent')).rejects.toThrow('Agent not found');
  });

  it('unsubscribing without an active subscription throws 404', async () => {
    setToken('jwt-subscriber');
    global.fetch.mockResolvedValueOnce(err({ error: 'Subscription not found' }, 404));

    await expect(api.unsubscribeAgent('agent-popular')).rejects.toThrow('Subscription not found');
  });

  it('subscribing requires authentication', async () => {
    // No token set — should get 401
    global.fetch.mockResolvedValueOnce(err({ error: 'Unauthorized' }, 401));

    await expect(api.subscribeAgent('agent-popular')).rejects.toThrow('Unauthorized');
  });
});

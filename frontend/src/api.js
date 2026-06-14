const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

// Simple in-memory cache with TTL
const _cache = new Map();
const CACHE_TTL_MS = 30_000;

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  _cache.set(key, { value, ts: Date.now() });
}

function cacheDelete(key) {
  _cache.delete(key);
}

export const api = {
  // --- Tools ----------------------------------------------------------------
  getTools: () => request('/tools'),

  // --- Agents (PostgreSQL) -------------------------------------------------
  listAgents: () => request('/agents'),
  getAgent: (id) => request(`/agents/${id}`),
  createAgent: (agent) => request('/agents', { method: 'POST', body: JSON.stringify(agent) }),
  updateAgent: (id, agent) => request(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(agent) }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: 'DELETE' }),

  // --- Skills (PostgreSQL) -------------------------------------------------
  listSkills: () => request('/skills'),
  createSkill: (skill) => request('/skills', { method: 'POST', body: JSON.stringify(skill) }),
  updateSkill: (id, skill) => request(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(skill) }),
  deleteSkill: (id) => request(`/skills/${id}`, { method: 'DELETE' }),

  // --- Health ---------------------------------------------------------------
  health: () => request('/health'),

  // --- User Preferences (MongoDB) ------------------------------------------
  // Gracefully returns {} when MongoDB is unavailable (503 / network error).
  getUserPreferences: async (userId) => {
    const key = `prefs:${userId}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    try {
      const data = await request(`/preferences/${userId}`);
      cacheSet(key, data);
      return data;
    } catch {
      return {};
    }
  },

  saveUserPreferences: async (userId, preferences) => {
    cacheDelete(`prefs:${userId}`);
    try {
      await request(`/preferences/${userId}`, {
        method: 'POST',
        body: JSON.stringify(preferences),
      });
    } catch {
      // best-effort; caller may choose to surface the error
    }
  },

  // --- Workspace State (MongoDB) -------------------------------------------
  // Gracefully returns {} when MongoDB is unavailable.
  getWorkspaceData: async (workspaceId) => {
    const key = `ws:${workspaceId}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    try {
      const data = await request(`/workspace/${workspaceId}`);
      cacheSet(key, data);
      return data;
    } catch {
      return {};
    }
  },

  saveWorkspaceData: async (workspaceId, data) => {
    cacheDelete(`ws:${workspaceId}`);
    try {
      await request(`/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch {
      // best-effort
    }
  },

  // --- Draft Agents (MongoDB) ----------------------------------------------
  saveDraftAgent: async (workspaceId, agentData) => {
    try {
      await request('/drafts', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, agentData }),
      });
    } catch {
      // best-effort
    }
  },
};

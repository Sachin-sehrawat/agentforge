import { TEMPLATES as STATIC_TEMPLATES } from './data/templates.js';

const BASE = '/api';

// --- Auth state --------------------------------------------------------------

let _token = null;
let _on401Handler = null;

export function setToken(token) {
  _token = token;
}

// Register a callback invoked when any authenticated request receives 401.
// Only fires when a token was present — avoids spurious redirects on login failures.
export function onUnauthorized(handler) {
  _on401Handler = handler;
}

// --- Core request ------------------------------------------------------------

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, {
    headers,
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
    const err = new Error(message);
    err.status = res.status;

    if (res.status === 401) {
      const hadToken = !!_token;
      _token = null;
      if (hadToken && _on401Handler) _on401Handler();
    }

    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// --- Cache -------------------------------------------------------------------

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

// Tracks server-side updatedAt timestamps for workspace conflict detection
const _serverTimestamps = new Map();

// Exposed so tests can reset module-level state between runs
export function _clearCache() {
  _cache.clear();
  _serverTimestamps.clear();
  _token = null;
  _on401Handler = null;
}

// --- Retry -------------------------------------------------------------------

// Exponential backoff: 500ms, 1000ms — skips retry for 4xx client errors
async function withRetry(fn, maxAttempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err.status !== undefined && err.status >= 400 && err.status < 500) throw err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

// --- Preference validation ---------------------------------------------------

const VALID_THEMES = new Set(['light', 'dark', 'system']);

function validatePreferences(prefs) {
  if (typeof prefs !== 'object' || prefs === null) {
    throw new Error('Preferences must be a non-null object');
  }
  if (prefs.theme !== undefined && !VALID_THEMES.has(prefs.theme)) {
    throw new Error(`theme must be one of: ${[...VALID_THEMES].join(', ')}`);
  }
  if (prefs.canvas_zoom !== undefined) {
    if (typeof prefs.canvas_zoom !== 'number' || prefs.canvas_zoom < 0.1 || prefs.canvas_zoom > 5) {
      throw new Error('canvas_zoom must be a number between 0.1 and 5');
    }
  }
  if (prefs.canvas_pan !== undefined) {
    const p = prefs.canvas_pan;
    if (typeof p !== 'object' || p === null || typeof p.x !== 'number' || typeof p.y !== 'number') {
      throw new Error('canvas_pan must be an object with numeric x and y');
    }
  }
  if (prefs.sidebar_width !== undefined) {
    if (typeof prefs.sidebar_width !== 'number' || prefs.sidebar_width < 0 || prefs.sidebar_width > 2000) {
      throw new Error('sidebar_width must be a number between 0 and 2000');
    }
  }
}

const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system',
  canvas_zoom: 1,
  canvas_pan: { x: 0, y: 0 },
  sidebar_width: 280,
});

// --- API surface -------------------------------------------------------------

export const api = {
  // --- Tools ----------------------------------------------------------------
  getTools: () => request('/tools'),

  // --- Agents (PostgreSQL) -------------------------------------------------
  listAgents: () => request('/agents'),
  listPublicAgents: () => request('/agents/public'),
  listMyAgents: () => request('/agents/mine'),
  getAgent: (id) => request(`/agents/${id}`),
  createAgent: (agent) => request('/agents', { method: 'POST', body: JSON.stringify(agent) }),
  updateAgent: (id, agent) => request(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(agent) }),
  updateAgentVisibility: (id, visibility) =>
    request(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify({ visibility }) }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: 'DELETE' }),
  subscribeAgent: (id) => request(`/agents/${id}/subscribe`, { method: 'POST' }),
  unsubscribeAgent: (id) => request(`/agents/${id}/subscribe`, { method: 'DELETE' }),

  // Marketplace listing — accepts { q, model, tools, sort, minRating, page, pageSize }
  listMarketplace: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.model) qs.set('model', params.model);
    if (params.tools?.length) qs.set('tools', params.tools.join(','));
    if (params.sort) qs.set('sort', params.sort);
    if (params.minRating > 0) qs.set('minRating', String(params.minRating));
    if (params.page > 1) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    const path = `/agents/marketplace${qs.toString() ? `?${qs}` : ''}`;
    return request(path);
  },

  // Rating — PUT /agents/:id/rating  { rating: 1-5 }
  rateAgent: (id, rating) =>
    request(`/agents/${id}/rating`, { method: 'PUT', body: JSON.stringify({ rating }) }),

  // Favorite / unfavorite / list favorites
  favoriteAgent: (id) => request(`/agents/${id}/favorite`, { method: 'POST' }),
  unfavoriteAgent: (id) => request(`/agents/${id}/favorite`, { method: 'DELETE' }),
  listFavorites: () => request('/agents/favorites'),

  // Fork
  forkAgent: (id) => request(`/agents/${id}/fork`, { method: 'POST' }),

  // Bust the cache for a specific marketplace path after a write
  bustMarketplaceCache: () => {
    for (const key of _cache.keys()) {
      if (key.startsWith('/agents/marketplace') || key === '/agents/marketplace') {
        _cache.delete(key);
      }
    }
  },
  listAgentVersions: (id) => request(`/agents/${id}/versions`),
  getAgentVersion: (id, versionNo) => request(`/agents/${id}/versions/${versionNo}`),
  restoreAgentVersion: (id, versionNo) => request(`/agents/${id}/versions/${versionNo}/restore`, { method: 'POST' }),

  // --- Skills (PostgreSQL) -------------------------------------------------
  listSkills: () => request('/skills'),
  listPublicSkills: () => request('/skills/public'),
  listMySkills: () => request('/skills/mine'),
  createSkill: (skill) => request('/skills', { method: 'POST', body: JSON.stringify(skill) }),
  updateSkill: (id, skill) => request(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(skill) }),
  deleteSkill: (id) => request(`/skills/${id}`, { method: 'DELETE' }),

  // --- Builtin Skills (MongoDB) --------------------------------------------
  listBuiltinSkills: () => request('/builtin-skills'),
  createBuiltinSkill: (skill) => request('/builtin-skills', { method: 'POST', body: JSON.stringify(skill) }),
  updateBuiltinSkill: (id, skill) => request(`/builtin-skills/${id}`, { method: 'PUT', body: JSON.stringify(skill) }),
  deleteBuiltinSkill: (id) => request(`/builtin-skills/${id}`, { method: 'DELETE' }),

  // --- Persona Categories (MongoDB) ----------------------------------------
  listPersonaCategories: () => request('/personas'),
  createPersonaCategory: (category) => request('/personas', { method: 'POST', body: JSON.stringify(category) }),
  updatePersonaCategory: (id, category) => request(`/personas/${id}`, { method: 'PUT', body: JSON.stringify(category) }),
  deletePersonaCategory: (id) => request(`/personas/${id}`, { method: 'DELETE' }),
  createPersona: (categoryId, persona) => request(`/personas/${categoryId}/personas`, { method: 'POST', body: JSON.stringify(persona) }),
  updatePersona: (categoryId, personaId, persona) => request(`/personas/${categoryId}/personas/${personaId}`, { method: 'PUT', body: JSON.stringify(persona) }),
  deletePersona: (categoryId, personaId) => request(`/personas/${categoryId}/personas/${personaId}`, { method: 'DELETE' }),

  // --- Auth ----------------------------------------------------------------
  signup: (email, password, display_name) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, display_name }) }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),
  logout: () => { _token = null; },

  // --- Agent import (stateless) -------------------------------------------
  importAgent: (format, content) =>
    request('/agents/import', { method: 'POST', body: JSON.stringify({ format, content }) }),

  // --- Agent Templates (MongoDB) -------------------------------------------
  // Falls back to the static list when MongoDB is unavailable.
  listTemplates: async () => {
    try {
      return await request('/templates');
    } catch {
      return STATIC_TEMPLATES;
    }
  },
  getTemplate: (id) => request(`/templates/${id}`),
  createTemplate: (template) => request('/templates', { method: 'POST', body: JSON.stringify(template) }),
  updateTemplate: (id, template) => request(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(template) }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),

  // --- Health ---------------------------------------------------------------
  health: () => request('/health'),

  // --- User Preferences (MongoDB) ------------------------------------------

  // Returns cached preferences merged with defaults.
  // Falls back to defaults when MongoDB is unavailable (503 / network error).
  getUserPreferences: async (userId) => {
    const key = `prefs:${userId}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    try {
      const data = await request(`/preferences/${userId}`);
      const prefs = { ...DEFAULT_PREFERENCES, ...data };
      cacheSet(key, prefs);
      return prefs;
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  },

  // Validates the preference object, then optimistically updates the cache
  // so the UI reflects changes immediately. Retries the network request up to
  // 3 times (exponential backoff). Reverts the cache and throws if all
  // attempts fail.
  saveUserPreferences: async (userId, preferences) => {
    validatePreferences(preferences);
    const key = `prefs:${userId}`;
    const previous = cacheGet(key);
    cacheSet(key, { ...DEFAULT_PREFERENCES, ...previous, ...preferences });
    try {
      const result = await withRetry(() =>
        request(`/preferences/${userId}`, {
          method: 'POST',
          body: JSON.stringify(preferences),
        })
      );
      if (result?.preferences) {
        cacheSet(key, { ...DEFAULT_PREFERENCES, ...result.preferences });
      }
      return result;
    } catch (err) {
      if (previous !== undefined) cacheSet(key, previous);
      else cacheDelete(key);
      throw new Error(`Failed to save preferences: ${err.message}`);
    }
  },

  // --- Workspace State (MongoDB) -------------------------------------------

  // Returns cached workspace data or fetches fresh.
  // Falls back to {} when MongoDB is unavailable.
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

  // Saves workspace state with optimistic cache update and retry.
  // Pass { expectedUpdatedAt } in options to enable conflict detection —
  // throws when the server timestamp has advanced past the expected value,
  // indicating a concurrent edit from another session.
  saveWorkspaceData: async (workspaceId, data, options = {}) => {
    const key = `ws:${workspaceId}`;
    const { expectedUpdatedAt } = options;

    if (expectedUpdatedAt !== undefined) {
      const lastKnown = _serverTimestamps.get(key);
      if (lastKnown !== undefined && lastKnown !== expectedUpdatedAt) {
        throw new Error('Conflict: workspace data was modified since your last save');
      }
    }

    const previous = cacheGet(key);
    cacheSet(key, { ...previous, ...data });

    try {
      const result = await withRetry(() =>
        request(`/workspace/${workspaceId}`, {
          method: 'POST',
          body: JSON.stringify(data),
        })
      );
      if (result?.data) cacheSet(key, result.data);
      if (result?.updatedAt) _serverTimestamps.set(key, result.updatedAt);
      return result;
    } catch (err) {
      if (previous !== undefined) cacheSet(key, previous);
      else cacheDelete(key);
      throw new Error(`Failed to save workspace: ${err.message}`);
    }
  },

  // --- Draft Agents (MongoDB) ----------------------------------------------

  // Returns cached drafts for the workspace, newest first.
  // Falls back to [] when MongoDB is unavailable.
  getDraftAgents: async (workspaceId) => {
    const key = `drafts:${workspaceId}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    try {
      const data = await request(`/drafts/${workspaceId}`);
      cacheSet(key, data);
      return data;
    } catch {
      return [];
    }
  },

  // Saves a new draft and invalidates the workspace's drafts cache.
  // Retries up to 3 times on network/server errors.
  saveDraftAgent: async (workspaceId, agentData) => {
    try {
      const result = await withRetry(() =>
        request(`/drafts/${workspaceId}`, {
          method: 'POST',
          body: JSON.stringify({ agentData }),
        })
      );
      cacheDelete(`drafts:${workspaceId}`);
      return result;
    } catch (err) {
      throw new Error(`Failed to save draft: ${err.message}`);
    }
  },

  // Deletes a draft by its MongoDB _id and invalidates all drafts caches
  // (workspace association is not tracked client-side).
  deleteDraftAgent: async (draftId) => {
    try {
      await request(`/drafts/${draftId}`, { method: 'DELETE' });
      for (const key of _cache.keys()) {
        if (key.startsWith('drafts:')) _cache.delete(key);
      }
    } catch (err) {
      throw new Error(`Failed to delete draft: ${err.message}`);
    }
  },
};

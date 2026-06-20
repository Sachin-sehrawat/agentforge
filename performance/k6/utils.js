// Shared utility functions for k6 load tests.

import { check } from 'k6';

export const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Returns k6 params with an endpoint tag for threshold filtering and JSON headers.
export function taggedParams(endpoint, extra = {}) {
  return {
    headers: JSON_HEADERS,
    tags: { endpoint },
    ...extra,
  };
}

// Random agent payload — uses vu/iteration suffix to avoid name collisions.
export function randomAgent(suffix) {
  const models = ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-8'];
  const allTools = ['calculator', 'code_runner', 'http_request', 'web_search'];
  const numTools = Math.floor(Math.random() * 3);
  return {
    name: `LoadTest-${suffix || Date.now()}`,
    persona: 'A test assistant for performance benchmarking.',
    systemPrompt: `Performance test agent. Run: ${Date.now()}`,
    model: models[Math.floor(Math.random() * models.length)],
    tools: allTools.slice(0, numTools),
    positions: { x: Math.floor(Math.random() * 800), y: Math.floor(Math.random() * 600) },
    skills: [],
    instructions: ['Be concise', 'Respond accurately'],
  };
}

// Random valid preferences payload.
export function randomPreferences() {
  const themes = ['light', 'dark', 'system'];
  return {
    theme: themes[Math.floor(Math.random() * themes.length)],
    canvas_zoom: Math.round((0.5 + Math.random() * 2) * 10) / 10,
    canvas_pan: {
      x: Math.round((Math.random() * 2000) - 1000),
      y: Math.round((Math.random() * 2000) - 1000),
    },
    sidebar_width: 200 + Math.floor(Math.random() * 400),
  };
}

// Random valid workspace payload.
export function randomWorkspaceData(agentId) {
  const tabs = ['canvas', 'chat', 'agents'];
  return {
    selected_agent: agentId || null,
    agent_positions: agentId
      ? { [agentId]: { x: Math.floor(Math.random() * 800), y: Math.floor(Math.random() * 600) } }
      : {},
    active_tab: tabs[Math.floor(Math.random() * tabs.length)],
  };
}

// Asserts 2xx status and response time under 500ms. Returns true if both pass.
export function checkOk(res, label) {
  return check(res, {
    [`${label} → status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${label} → duration < 500ms`]: (r) => r.timings.duration < 500,
  });
}

// Asserts 2xx OR 429 (rate limited) — used for MongoDB-backed routes.
// Returns true if response is acceptable (not a server error).
export function checkOkOrRateLimited(res, label) {
  return check(res, {
    [`${label} → status 2xx or 429`]: (r) => (r.status >= 200 && r.status < 300) || r.status === 429,
    [`${label} → duration < 1000ms`]: (r) => r.timings.duration < 1000,
  });
}

// Safe JSON parse — returns null on failure instead of throwing.
export function parseBody(res) {
  try { return JSON.parse(res.body); } catch { return null; }
}

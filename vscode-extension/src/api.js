const { getApiUrl } = require('./config');

// Thin REST client for the AgentForge backend. Mirrors the error-shape
// conventions of frontend/src/api.js (Error with a numeric .status) so
// callers can branch on status the same way the web app does.
async function request(path, { token, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${getApiUrl()}${path}`, { ...options, headers });
  } catch (err) {
    const wrapped = new Error(
      `Could not reach AgentForge backend at ${getApiUrl()} (${err.message}). ` +
      'Check the "agentforge.apiUrl" setting and that the backend is running.'
    );
    wrapped.cause = err;
    throw wrapped;
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore parse errors on non-JSON error bodies
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

function login(email, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

function listMyAgents(token) {
  return request('/api/agents/mine', { token });
}

function getAgent(id, token) {
  return request(`/api/agents/${id}`, { token });
}

function deleteAgent(id, token) {
  return request(`/api/agents/${id}`, { method: 'DELETE', token });
}

function recordExportEvent(id, token) {
  return request(`/api/agents/${id}/export-event`, { method: 'POST', token });
}

function listBuiltinSkills() {
  return request('/api/builtin-skills');
}

function listPublicSkills(token) {
  return request('/api/skills/public', { token });
}

function listMySkills(token) {
  return request('/api/skills/mine', { token });
}

function listPersonaCategories() {
  return request('/api/personas');
}

// Binary response (zip) — bypasses the JSON-only `request` helper.
async function exportMcp(id, token) {
  const res = await fetch(`${getApiUrl()}/api/agents/${id}/export-mcp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    let details = null;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
      if (data?.details) details = data.details;
    } catch {
      // ignore
    }
    const err = new Error(message);
    err.status = res.status;
    err.details = details;
    throw err;
  }

  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match ? match[1] : `${id}-mcp-server.zip`;
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, filename };
}

module.exports = {
  login,
  listMyAgents,
  getAgent,
  deleteAgent,
  recordExportEvent,
  listBuiltinSkills,
  listPublicSkills,
  listMySkills,
  listPersonaCategories,
  exportMcp,
};

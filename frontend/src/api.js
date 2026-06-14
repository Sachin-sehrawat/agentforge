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

export const api = {
  getTools: () => request('/tools'),
  listAgents: () => request('/agents'),
  getAgent: (id) => request(`/agents/${id}`),
  createAgent: (agent) => request('/agents', { method: 'POST', body: JSON.stringify(agent) }),
  updateAgent: (id, agent) => request(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(agent) }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: 'DELETE' }),
  runAgent: (agent, messages) => request('/run', { method: 'POST', body: JSON.stringify({ agent, messages }) }),
  health: () => request('/health'),
};

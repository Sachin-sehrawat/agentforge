// k6 load test — Agent CRUD (PostgreSQL-backed)
// Acceptance criteria: p95 < 200ms, error rate < 1%
//
// Usage:
//   k6 run scenarios/agents.js
//   SCENARIO=load_500 k6 run scenarios/agents.js
//   SCENARIO=load_1000 BASE_URL=http://staging:4000 k6 run scenarios/agents.js

import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, getStages, thresholds } from '../config.js';
import { randomAgent, checkOk, taggedParams, parseBody } from '../utils.js';

// Custom per-operation duration metrics (true = report in ms)
const listDuration   = new Trend('agent_list_duration_ms', true);
const getDuration    = new Trend('agent_get_duration_ms', true);
const createDuration = new Trend('agent_create_duration_ms', true);
const updateDuration = new Trend('agent_update_duration_ms', true);
const deleteDuration = new Trend('agent_delete_duration_ms', true);

const agentsCreated  = new Counter('agents_total_created');
const createErrors   = new Rate('agent_create_error_rate');

export const options = {
  stages: getStages(),
  thresholds: {
    ...thresholds,
    agent_list_duration_ms:   ['p(95)<200', 'p(99)<400'],
    agent_get_duration_ms:    ['p(95)<150', 'p(99)<300'],
    agent_create_duration_ms: ['p(95)<200', 'p(99)<400'],
    agent_update_duration_ms: ['p(95)<200', 'p(99)<400'],
    agent_delete_duration_ms: ['p(95)<150', 'p(99)<300'],
    agent_create_error_rate:  ['rate<0.01'],
  },
};

export default function () {
  const params = taggedParams('agents');

  // ── 1. LIST all agents ───────────────────────────────────────────────────
  const listRes = http.get(`${BASE_URL}/api/agents`, params);
  listDuration.add(listRes.timings.duration);
  checkOk(listRes, 'GET /api/agents');
  const agents = parseBody(listRes);
  sleep(0.1);

  // ── 2. CREATE a new agent ────────────────────────────────────────────────
  const newAgent = randomAgent(`vu${__VU}-iter${__ITER}`);
  const createRes = http.post(
    `${BASE_URL}/api/agents`,
    JSON.stringify(newAgent),
    params
  );
  createDuration.add(createRes.timings.duration);
  const ok = checkOk(createRes, 'POST /api/agents');
  createErrors.add(!ok);

  const created = parseBody(createRes);
  if (!created?.id) {
    sleep(1);
    return; // Skip remaining steps if create failed
  }
  agentsCreated.add(1);
  const id = created.id;
  sleep(0.1);

  // ── 3. GET by ID ─────────────────────────────────────────────────────────
  const getRes = http.get(`${BASE_URL}/api/agents/${id}`, params);
  getDuration.add(getRes.timings.duration);
  checkOk(getRes, 'GET /api/agents/:id');
  sleep(0.1);

  // ── 4. UPDATE ────────────────────────────────────────────────────────────
  const updatedPayload = { ...newAgent, name: `${newAgent.name}-updated` };
  const updateRes = http.put(
    `${BASE_URL}/api/agents/${id}`,
    JSON.stringify(updatedPayload),
    params
  );
  updateDuration.add(updateRes.timings.duration);
  checkOk(updateRes, 'PUT /api/agents/:id');
  sleep(0.1);

  // ── 5. READ another existing agent (simulates browsing) ──────────────────
  if (Array.isArray(agents) && agents.length > 1) {
    const other = agents[Math.floor(Math.random() * agents.length)];
    if (other.id !== id) {
      const browseRes = http.get(`${BASE_URL}/api/agents/${other.id}`, params);
      getDuration.add(browseRes.timings.duration);
      checkOk(browseRes, 'GET /api/agents/:id (browse)');
      sleep(0.1);
    }
  }

  // ── 6. DELETE the created agent (keeps DB size stable during test) ───────
  const deleteRes = http.del(`${BASE_URL}/api/agents/${id}`, null, params);
  deleteDuration.add(deleteRes.timings.duration);
  checkOk(deleteRes, 'DELETE /api/agents/:id');

  sleep(0.5 + Math.random() * 1.5);
}

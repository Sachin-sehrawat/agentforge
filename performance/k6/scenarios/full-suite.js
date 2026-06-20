// Full-suite load test combining all endpoints with realistic traffic mix.
//
// Traffic split (mirrors real-world AgentForge usage patterns):
//   60% → agent browsing / editing  (PostgreSQL)
//   25% → preferences reads/writes  (MongoDB, rate-limited)
//   15% → workspace state sync      (MongoDB, rate-limited)
//
// Each traffic type runs in a separate k6 scenario with its own VU pool so
// they don't interfere with each other's metrics.
//
// Usage:
//   k6 run scenarios/full-suite.js
//   BASE_URL=http://staging:4000 k6 run scenarios/full-suite.js

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL } from '../config.js';
import {
  randomAgent, randomPreferences, randomWorkspaceData,
  checkOk, taggedParams, parseBody,
} from '../utils.js';

// Per-endpoint duration trends
const agentDur  = new Trend('suite_agent_duration_ms', true);
const prefDur   = new Trend('suite_pref_duration_ms', true);
const wsDur     = new Trend('suite_ws_duration_ms', true);

const rateLimitTotal = new Counter('suite_rate_limit_hits');
const totalErrors    = new Rate('suite_error_rate');

// ── Scenario options ──────────────────────────────────────────────────────────
// Peak-load: ~280 total VUs (168 agents + 70 prefs + 42 workspace)

export const options = {
  scenarios: {
    agent_users: {
      executor: 'ramping-vus',
      exec: 'agentWorkflow',
      tags: { workflow: 'agents' },
      stages: [
        { duration: '2m', target: 60 },
        { duration: '5m', target: 120 },
        { duration: '5m', target: 168 },  // 60% of 280
        { duration: '5m', target: 168 },  // sustain
        { duration: '3m', target: 0 },
      ],
    },
    preference_users: {
      executor: 'ramping-vus',
      exec: 'preferencesWorkflow',
      tags: { workflow: 'preferences' },
      stages: [
        { duration: '2m', target: 25 },
        { duration: '5m', target: 50 },
        { duration: '5m', target: 70 },   // 25% of 280
        { duration: '5m', target: 70 },
        { duration: '3m', target: 0 },
      ],
    },
    workspace_users: {
      executor: 'ramping-vus',
      exec: 'workspaceWorkflow',
      tags: { workflow: 'workspace' },
      stages: [
        { duration: '2m', target: 15 },
        { duration: '5m', target: 30 },
        { duration: '5m', target: 42 },   // 15% of 280
        { duration: '5m', target: 42 },
        { duration: '3m', target: 0 },
      ],
    },
  },

  thresholds: {
    // Per-endpoint via HTTP tag
    'http_req_duration{endpoint:agents}':      ['p(95)<200'],
    'http_req_duration{endpoint:preferences}': ['p(95)<100'],
    'http_req_duration{endpoint:workspace}':   ['p(95)<150'],
    'http_req_duration{endpoint:drafts}':      ['p(95)<150'],
    // Custom trends
    suite_agent_duration_ms: ['p(95)<200', 'p(99)<400'],
    suite_pref_duration_ms:  ['p(95)<100', 'p(99)<200'],
    suite_ws_duration_ms:    ['p(95)<150', 'p(99)<300'],
    // Global
    http_req_failed:    ['rate<0.01'],
    suite_error_rate:   ['rate<0.01'],
    http_req_duration:  ['p(99)<500'],
  },
};

// ── Exported scenario functions ───────────────────────────────────────────────

export function agentWorkflow() {
  const params = taggedParams('agents');

  // List
  const listRes = http.get(`${BASE_URL}/api/agents`, params);
  agentDur.add(listRes.timings.duration);
  checkOk(listRes, 'list agents');
  sleep(0.2);

  // Create
  const agent = randomAgent(`suite-vu${__VU}-${__ITER}`);
  const createRes = http.post(`${BASE_URL}/api/agents`, JSON.stringify(agent), params);
  agentDur.add(createRes.timings.duration);
  totalErrors.add(createRes.status >= 500 ? 1 : 0);

  const body = parseBody(createRes);
  if (body?.id) {
    sleep(0.1);
    // Update
    http.put(
      `${BASE_URL}/api/agents/${body.id}`,
      JSON.stringify({ ...agent, name: `${agent.name}-v2` }),
      params
    );
    agentDur.add(createRes.timings.duration);
    sleep(0.1);
    // Delete (keeps DB size stable)
    http.del(`${BASE_URL}/api/agents/${body.id}`, null, params);
  }

  sleep(1 + Math.random() * 2);
}

export function preferencesWorkflow() {
  const userId = `user-${((__VU - 1) % 1000) + 1}`;
  const params = taggedParams('preferences');

  const getRes = http.get(`${BASE_URL}/api/preferences/${userId}`, params);
  prefDur.add(getRes.timings.duration);
  if (getRes.status === 429) rateLimitTotal.add(1);
  totalErrors.add(getRes.status >= 500 ? 1 : 0);
  check(getRes, { 'pref get ok': (r) => r.status === 200 || r.status === 429 });
  sleep(0.3);

  const saveRes = http.post(
    `${BASE_URL}/api/preferences/${userId}`,
    JSON.stringify(randomPreferences()),
    params
  );
  prefDur.add(saveRes.timings.duration);
  if (saveRes.status === 429) rateLimitTotal.add(1);
  totalErrors.add(saveRes.status >= 500 ? 1 : 0);
  check(saveRes, { 'pref save ok': (r) => r.status === 200 || r.status === 429 });

  sleep(4 + Math.random() * 6);
}

export function workspaceWorkflow() {
  const wsId = `ws-${((__VU - 1) % 500) + 1}`;
  const params = taggedParams('workspace');

  const getRes = http.get(`${BASE_URL}/api/workspace/${wsId}`, params);
  wsDur.add(getRes.timings.duration);
  if (getRes.status === 429) rateLimitTotal.add(1);
  totalErrors.add(getRes.status >= 500 ? 1 : 0);
  check(getRes, { 'ws get ok': (r) => r.status === 200 || r.status === 429 });
  sleep(0.3);

  const saveRes = http.post(
    `${BASE_URL}/api/workspace/${wsId}`,
    JSON.stringify(randomWorkspaceData()),
    params
  );
  wsDur.add(saveRes.timings.duration);
  if (saveRes.status === 429) rateLimitTotal.add(1);
  totalErrors.add(saveRes.status >= 500 ? 1 : 0);
  check(saveRes, { 'ws save ok': (r) => r.status === 200 || r.status === 429 });

  sleep(5 + Math.random() * 10);
}

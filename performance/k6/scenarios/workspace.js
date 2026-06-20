// k6 load test — Workspace State and Draft Agents API (MongoDB-backed, rate-limited)
// Acceptance criteria: Workspace p95 < 150ms, Drafts p95 < 150ms
//
// NOTE: Same rate-limit caveat as preferences.js — 100 req/IP/min.
// Track `ws_rate_limit_hits` to distinguish capacity issues from rate limiting.
//
// Usage:
//   k6 run scenarios/workspace.js
//   SCENARIO=load_500 k6 run scenarios/workspace.js

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, getStages, thresholds } from '../config.js';
import { randomWorkspaceData, taggedParams, parseBody } from '../utils.js';

const wsGetDuration    = new Trend('ws_get_duration_ms', true);
const wsSaveDuration   = new Trend('ws_save_duration_ms', true);
const draftListDur     = new Trend('draft_list_duration_ms', true);
const draftSaveDur     = new Trend('draft_save_duration_ms', true);
const rateLimitHits    = new Counter('ws_rate_limit_hits');
const wsServerErrors   = new Rate('ws_server_error_rate');

export const options = {
  stages: getStages(),
  thresholds: {
    ...thresholds,
    ws_get_duration_ms:    ['p(95)<150', 'p(99)<300'],
    ws_save_duration_ms:   ['p(95)<150', 'p(99)<300'],
    draft_list_duration_ms: ['p(95)<150', 'p(99)<300'],
    draft_save_duration_ms: ['p(95)<200', 'p(99)<400'],
    ws_server_error_rate:  ['rate<0.01'],
  },
};

export default function () {
  // 500 distinct workspace IDs — matches realistic multi-user scenario
  const wsId = `ws-${((__VU - 1) % 500) + 1}`;

  // ── 1. GET workspace state ────────────────────────────────────────────────
  const wsParams = taggedParams('workspace');
  const getRes = http.get(`${BASE_URL}/api/workspace/${wsId}`, wsParams);
  wsGetDuration.add(getRes.timings.duration);
  check(getRes, {
    'GET workspace → 2xx or 429': (r) => r.status === 200 || r.status === 429,
    'GET workspace → < 500ms': (r) => r.timings.duration < 500,
  });
  if (getRes.status === 429) rateLimitHits.add(1);
  wsServerErrors.add(getRes.status >= 500 ? 1 : 0);
  sleep(0.2);

  // ── 2. POST workspace state update ────────────────────────────────────────
  const saveRes = http.post(
    `${BASE_URL}/api/workspace/${wsId}`,
    JSON.stringify(randomWorkspaceData()),
    wsParams
  );
  wsSaveDuration.add(saveRes.timings.duration);
  check(saveRes, {
    'POST workspace → 2xx or 429': (r) => r.status === 200 || r.status === 429,
    'POST workspace → < 500ms': (r) => r.timings.duration < 500,
  });
  if (saveRes.status === 429) rateLimitHits.add(1);
  wsServerErrors.add(saveRes.status >= 500 ? 1 : 0);
  sleep(0.2);

  // ── 3. GET draft agents ───────────────────────────────────────────────────
  const draftParams = taggedParams('drafts');
  const draftsRes = http.get(`${BASE_URL}/api/drafts/${wsId}`, draftParams);
  draftListDur.add(draftsRes.timings.duration);
  check(draftsRes, {
    'GET drafts → 2xx or 429': (r) => r.status === 200 || r.status === 429,
    'GET drafts → < 500ms': (r) => r.timings.duration < 500,
  });
  if (draftsRes.status === 429) rateLimitHits.add(1);
  sleep(0.2);

  // ── 4. POST draft (auto-save simulation) ─────────────────────────────────
  const draftSaveRes = http.post(
    `${BASE_URL}/api/drafts/${wsId}`,
    JSON.stringify({
      agentData: {
        name: `Draft-${__VU}-${__ITER}`,
        model: 'claude-sonnet-4-6',
        tools: ['calculator'],
      },
    }),
    draftParams
  );
  draftSaveDur.add(draftSaveRes.timings.duration);
  check(draftSaveRes, {
    'POST draft → 2xx or 429': (r) =>
      r.status === 200 || r.status === 201 || r.status === 429,
    'POST draft → < 500ms': (r) => r.timings.duration < 500,
  });
  if (draftSaveRes.status === 429) rateLimitHits.add(1);

  // Delete the draft we just created to avoid unbounded collection growth
  const draftBody = parseBody(draftSaveRes);
  if (draftBody?.id) {
    const delParams = taggedParams('drafts');
    http.del(`${BASE_URL}/api/drafts/${draftBody.id}`, null, delParams);
  }

  // Auto-save happens infrequently in the real app
  sleep(3 + Math.random() * 5);
}

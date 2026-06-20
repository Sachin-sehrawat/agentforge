// k6 load test — User Preferences API (MongoDB-backed, rate-limited)
// Acceptance criteria: p95 < 100ms
//
// IMPORTANT: This endpoint is rate-limited to 100 req/IP/min.
// High-concurrency tests from a single host will trigger 429s — these are
// tracked via `rate_limit_hits` and excluded from the error rate threshold.
// For accurate p95 numbers above 100 VUs, run k6 from multiple hosts or use
// --out cloud with distributed execution.
//
// Usage:
//   k6 run scenarios/preferences.js
//   SCENARIO=load_100 k6 run scenarios/preferences.js

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL, getStages, thresholds } from '../config.js';
import { randomPreferences, taggedParams } from '../utils.js';

const getPrefDuration  = new Trend('pref_get_duration_ms', true);
const savePrefDuration = new Trend('pref_save_duration_ms', true);
const rateLimitHits    = new Counter('pref_rate_limit_hits');
const serverErrorRate  = new Rate('pref_server_error_rate');

export const options = {
  stages: getStages(),
  thresholds: {
    ...thresholds,
    pref_get_duration_ms:   ['p(95)<100', 'p(99)<200'],
    pref_save_duration_ms:  ['p(95)<100', 'p(99)<200'],
    pref_server_error_rate: ['rate<0.01'],
  },
};

export default function () {
  // 1000 distinct user IDs — avoids collisions between VUs
  const userId = `user-${((__VU - 1) % 1000) + 1}`;
  const params = taggedParams('preferences');

  // ── 1. GET preferences ───────────────────────────────────────────────────
  const getRes = http.get(`${BASE_URL}/api/preferences/${userId}`, params);
  getPrefDuration.add(getRes.timings.duration);

  check(getRes, {
    'GET prefs → 2xx or 429': (r) => r.status === 200 || r.status === 429,
    'GET prefs → duration < 500ms': (r) => r.timings.duration < 500,
  });
  if (getRes.status === 429) rateLimitHits.add(1);
  serverErrorRate.add(getRes.status >= 500 ? 1 : 0);

  sleep(0.3);

  // ── 2. POST preferences update ────────────────────────────────────────────
  const saveRes = http.post(
    `${BASE_URL}/api/preferences/${userId}`,
    JSON.stringify(randomPreferences()),
    params
  );
  savePrefDuration.add(saveRes.timings.duration);

  check(saveRes, {
    'POST prefs → 2xx or 429': (r) => r.status === 200 || r.status === 429,
    'POST prefs → duration < 500ms': (r) => r.timings.duration < 500,
  });
  if (saveRes.status === 429) rateLimitHits.add(1);
  serverErrorRate.add(saveRes.status >= 500 ? 1 : 0);

  // Real users don't hammer preferences — simulate realistic think time
  sleep(2 + Math.random() * 3);
}

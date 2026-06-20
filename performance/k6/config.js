// Shared k6 configuration: performance thresholds, load stages, and base URL.
// Override BASE_URL and SCENARIO via environment variables:
//   BASE_URL=http://staging:4000 SCENARIO=load_500 k6 run scenarios/agents.js

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// Performance acceptance thresholds (mirrors issue acceptance criteria)
export const thresholds = {
  // Per-endpoint duration thresholds via tags
  'http_req_duration{endpoint:agents}': ['p(95)<200'],       // Agent CRUD: p95 < 200ms
  'http_req_duration{endpoint:preferences}': ['p(95)<100'],  // Preferences: p95 < 100ms
  'http_req_duration{endpoint:workspace}': ['p(95)<150'],    // Workspace: p95 < 150ms
  'http_req_duration{endpoint:drafts}': ['p(95)<150'],       // Drafts: p95 < 150ms
  // Global error rate (excludes 429 — track separately via custom metric)
  http_req_failed: ['rate<0.01'],
  // Overall catch-all
  http_req_duration: ['p(99)<500', 'p(95)<300'],
};

// Load stages for each scenario type
export const stages = {
  // Quick sanity check — verifies the server is responding
  smoke: [
    { duration: '1m', target: 5 },
    { duration: '30s', target: 0 },
  ],

  // 100 concurrent users — typical daily load
  load_100: [
    { duration: '2m', target: 50 },   // ramp up
    { duration: '5m', target: 100 },  // sustain
    { duration: '2m', target: 0 },    // ramp down
  ],

  // 500 concurrent users — peak daytime traffic
  load_500: [
    { duration: '3m', target: 100 },
    { duration: '3m', target: 300 },
    { duration: '5m', target: 500 },
    { duration: '3m', target: 0 },
  ],

  // 1000+ concurrent users — stress/capacity ceiling test
  load_1000: [
    { duration: '3m', target: 200 },
    { duration: '3m', target: 500 },
    { duration: '5m', target: 1000 },
    { duration: '5m', target: 500 },  // partial recovery
    { duration: '3m', target: 0 },
  ],

  // Sudden traffic spike (launch event / viral scenario)
  spike: [
    { duration: '1m', target: 10 },
    { duration: '30s', target: 500 },  // instant spike
    { duration: '2m', target: 10 },    // recovery check
    { duration: '30s', target: 1000 }, // extreme spike
    { duration: '2m', target: 0 },
  ],

  // 2-hour soak test — catches slow memory leaks & connection exhaustion
  soak: [
    { duration: '5m', target: 100 },
    { duration: '2h', target: 100 },
    { duration: '5m', target: 0 },
  ],
};

export function getStages() {
  const scenario = __ENV.SCENARIO || 'load_100';
  if (!stages[scenario]) {
    console.warn(`Unknown SCENARIO "${scenario}", falling back to load_100`);
    return stages.load_100;
  }
  return stages[scenario];
}

# AgentForge Testing Guide

## Overview

AgentForge uses [Vitest](https://vitest.dev/) for both backend and frontend tests. No live database is required — all database I/O is mocked. The backend HTTP tests spin up a real Express server on a random port using Node's `http.createServer`.

**Coverage targets:** 90% lines/functions/statements, 85% branches.

---

## Running Tests

### Backend

```bash
cd backend

# Run all tests once
npm test

# Watch mode (re-runs on file save)
npm run test:watch

# Run with coverage report
npm run test:coverage
# → HTML report at backend/coverage/index.html
```

### Frontend

```bash
cd frontend

# Run all tests once
npm test

# Watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage
# → HTML report at frontend/coverage/index.html
```

### Both Together (from repo root)

```bash
cd backend && npm test && cd ../frontend && npm test
```

---

## Test Architecture

### Backend Tests (`backend/tests/`)

| File | What it tests | Approach |
|------|--------------|----------|
| `server.test.js` | All HTTP endpoints (full stack) | Real Express server + mocked pg/MongoDB |
| `agentRunner.test.js` | Agent execution loop + tools | Mocked Anthropic SDK, real tool executors |
| `db.test.js` | PostgreSQL pool: query, healthCheck, withRetry | Mocked pg Pool |
| `mongo-endpoints.test.js` | MongoDB collection operations | Mocked MongoDB client |
| `validation.test.js` | Input validators for preferences/workspace/drafts | Pure unit tests |
| `calculator.test.js` | Math expression evaluation | Real mathjs execution |
| `codeRunner.test.js` | JS VM sandbox execution | Real Node VM sandbox |
| `toolDefinitions.test.js` | Tool catalog structure | Pure unit tests |

**Key pattern — HTTP endpoint tests:**

```javascript
// Mocks must be declared before importing app
vi.mock('pg', () => ({ ... }));
vi.mock('../src/mongo.js', () => ({ ... }));

const { app } = await import('../src/app.js');

// Spin up a real HTTP server on a random OS-assigned port
let server, baseUrl;
beforeAll(() => new Promise((resolve) => {
  server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
afterAll(() => new Promise((resolve) => server.close(resolve)));
```

Each test group uses `vi.clearAllMocks()` in `beforeEach` to reset mock state between tests.

**Key pattern — agentRunner tests:**

```javascript
// Mock Anthropic SDK before importing agentRunner
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));
import { runAgent } from '../src/agentRunner.js';

// Control what the model returns in each test
mockCreate.mockResolvedValueOnce({
  content: [{ type: 'text', text: 'Hello!' }],
  stop_reason: 'end_turn',
});
```

### Frontend Tests (`frontend/tests/`)

| File | What it tests | Approach |
|------|--------------|----------|
| `api.test.js` | `api.js` client: caching, retry, validation | Mocked `fetch`, `_clearCache` helper |
| `integration.test.js` | React components + full API lifecycle | React Testing Library + mocked `fetch` |

**Key pattern — component tests:**

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../src/components/ErrorBoundary.jsx';

it('renders fallback UI when a child throws', () => {
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  function ThrowingComponent() { throw new Error('Render failed'); }

  render(
    <ErrorBoundary>
      <ThrowingComponent />
    </ErrorBoundary>
  );

  expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  consoleSpy.mockRestore();
});
```

**Key pattern — API integration tests:**

```javascript
// Always clear cache between tests to avoid cross-test pollution
beforeEach(() => {
  _clearCache();
  global.fetch = vi.fn();
});

it('creates an agent via POST', async () => {
  const created = { id: 'new-id', name: 'Bot' };
  global.fetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => created });

  const result = await api.createAgent({ name: 'Bot' });
  expect(result.id).toBe('new-id');
});
```

---

## Test Fixtures

### Agent Row (PostgreSQL)

```javascript
function agentRow(overrides = {}) {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Test Agent',
    persona: '',
    system_prompt: '',
    model: 'claude-sonnet-4-6',
    tools: [],
    positions: {},
    skills: [],
    instructions: [],
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}
```

### Skill Row (PostgreSQL)

```javascript
function skillRow(overrides = {}) {
  return {
    id: 'bbbbbbbb-0000-0000-0000-000000000001',
    label: 'My Skill',
    color: '#6366f1',
    description: 'Does something useful',
    instruction: 'Be helpful always',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}
```

### Anthropic Text Response

```javascript
function textResponse(text) {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
}
```

### Anthropic Tool Use Response

```javascript
function toolUseResponse(name, id, input) {
  return {
    content: [{ type: 'tool_use', id, name, input }],
    stop_reason: 'tool_use',
  };
}
```

---

## Mocking Strategy

### PostgreSQL

All tests mock the `pg` module before importing any file that uses it:

```javascript
const mockPoolQuery = vi.fn();

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(function () {
      this.query = mockPoolQuery;
      this.connect = vi.fn();
      this.on = vi.fn();
    }),
  },
}));
```

Control return values per-test:

```javascript
mockPoolQuery.mockResolvedValueOnce({ rows: [agentRow()] }); // success
mockPoolQuery.mockRejectedValueOnce(new Error('db error')); // failure
```

### MongoDB

```javascript
const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();
const mockInsertOne = vi.fn();
const mockDeleteOne = vi.fn();
const mockFind = vi.fn();

vi.mock('../src/mongo.js', () => ({
  connect: vi.fn(),
  getDb: vi.fn(() => ({ collection: vi.fn(() => ({
    findOne: mockFindOne,
    updateOne: mockUpdateOne,
    insertOne: mockInsertOne,
    deleteOne: mockDeleteOne,
    find: mockFind,
  })) })),
  healthCheck: vi.fn(async () => ({ ok: true })),
}));
```

### Anthropic SDK

```javascript
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));
```

### Frontend `fetch`

```javascript
beforeEach(() => {
  _clearCache();
  global.fetch = vi.fn();
});

// Success response
global.fetch.mockResolvedValueOnce({
  ok: true, status: 200, json: async () => ({ theme: 'dark' })
});

// Error response
global.fetch.mockResolvedValueOnce({
  ok: false, status: 503, json: async () => ({ error: 'MongoDB unavailable' })
});

// Network error
global.fetch.mockRejectedValueOnce(new Error('Network error'));
```

---

## What is Tested

### API Endpoints (`server.test.js`)

- `GET /api/tools` — returns tool catalog with id/label/kind/description
- `GET /api/agents` — lists agents, serializes to camelCase, handles db errors
- `GET /api/agents/:id` — returns single agent, 404 when missing
- `POST /api/agents` — validates required name, filters invalid tool IDs, generates UUID
- `PUT /api/agents/:id` — 404 check, validation, field preservation
- `DELETE /api/agents/:id` — 204 on success, 404 when missing
- `GET /api/skills` — lists skills
- `POST /api/skills` — validates label + instruction, defaults color
- `PUT /api/skills/:id` — 404 check, validation
- `DELETE /api/skills/:id` — 204 on success, 404 when missing
- `GET /api/health` — 200 ok:true, 503 ok:false
- `GET /api/health/mongo` — 200 ok:true, 503 ok:false
- `GET /api/preferences/:userId` — returns prefs or `{}`
- `POST /api/preferences/:userId` — validates all fields, upserts, returns doc
- `GET /api/workspace/:workspaceId` — returns data or `{}`
- `POST /api/workspace/:workspaceId` — validates fields, upserts, returns doc
- `GET /api/drafts/:workspaceId` — returns array of drafts
- `POST /api/drafts/:workspaceId` — validates agentData, inserts, returns 201
- `DELETE /api/drafts/:draftId` — validates ObjectId format, 404 when missing
- Rate limiting — `X-RateLimit-*` headers present and decremented
- CORS — `Access-Control-Allow-Origin` header present

### Agent Runner (`agentRunner.test.js`)

- Text-only response returns reply, empty trace
- Conversation history preserved across turns
- System prompt built from persona + systemPrompt
- Default fallback system prompt
- Tools array filtered and passed to Anthropic
- Calculator tool executes (real math) and trace records result
- Tool result sent back to model in second iteration
- Multiple sequential tool calls across iterations
- Unknown tool returns `is_error: true` result
- Server-side `web_search` tool appears in trace without local execution
- Iteration limit of 6 enforced
- Anthropic API errors propagate to caller
- Code runner executes in VM sandbox, captures output

### Input Validation (`validation.test.js`)

- `validatePreferences` — all field types, ranges, required/optional
- `validateWorkspaceData` — all field types, null handling
- `validateDraftInput` — agentData required, extra fields stripped

### PostgreSQL Layer (`db.test.js`)

- `query()` — passes through to pool, re-throws errors, logs slow queries
- `healthCheck()` — releases client even when query throws
- `withRetry()` — retries transient errors, fails fast on fatal errors

### Frontend API Client (`api.test.js`)

- All CRUD methods send correct HTTP method and URL
- Cache hit avoids second fetch call
- Retry logic (3 attempts with exponential backoff)
- Cache revert on persistent failure
- Optimistic cache update before server responds
- Client-side validation before sending (preferences)
- Conflict detection for workspace saves
- Graceful fallback to defaults/empty when MongoDB returns 503

### React Components (`integration.test.js`)

- `ErrorBoundary` — renders children normally, shows fallback on throw
- `ErrorBoundary` — custom message prop, componentDidCatch called
- `ErrorBoundary` — "Try again" button resets error state

---

## CI/CD Integration

Tests run automatically via GitHub Actions on every push and pull request to `main` or `develop`.

**Workflow:** `.github/workflows/test.yml`

- Backend tests + coverage uploaded as artifact
- Frontend tests + coverage uploaded as artifact
- Frontend build verified
- Coverage summary posted as PR comment

To run the same checks locally before pushing:

```bash
# Backend
cd backend && npm run test:coverage

# Frontend
cd frontend && npm run test:coverage && npm run build
```

---

## Adding New Tests

### New API Endpoint

1. Add the route to `backend/src/app.js`
2. Add tests in `backend/tests/server.test.js`:
   - Happy path (correct inputs → expected response)
   - Validation error (missing/invalid fields → 400)
   - Not found (→ 404)
   - Database error (→ 500 or 503)
3. If it has frontend API client methods, add them to `frontend/tests/api.test.js`

### New React Component

1. Create the component in `frontend/src/components/`
2. Add tests in `frontend/tests/integration.test.js`:
   - Renders children / default state
   - User interactions (click, input)
   - Error states

### New Tool

1. Add executor in `backend/src/tools/`
2. Register in `backend/src/tools/toolDefinitions.js`
3. Add unit tests in `backend/tests/<toolName>.test.js`
4. Add `runAgent()` integration test covering the new tool's execution path

---

## Troubleshooting

**`vi.mock()` must be at the top of the file before imports.** Vitest hoists `vi.mock()` calls, but placing them before `import` statements makes the ordering explicit and avoids confusion.

**ESM circular imports.** If you see "Cannot access before initialization" errors, check for circular module imports. Break the cycle by extracting shared code to a new module.

**Rate-limit test isolation.** The in-memory rate-limit map in `app.js` persists across tests in the same file because the module is only imported once. Tests that check remaining-count behavior use unique IP/user identifiers to avoid interference.

**MongoDB ObjectId.** The `DELETE /api/drafts/:draftId` endpoint validates the ID format. Tests must use a valid 24-character hex string (e.g., `6670a1b2c3d4e5f6a7b8c9d0`).

# AgentForge API Reference

Base URL: `http://localhost:4000` (development)

All request and response bodies are JSON. All timestamps are ISO 8601 strings in UTC.

---

## Rate Limiting

MongoDB-backed routes (`/api/preferences`, `/api/workspace`, `/api/drafts`) enforce a sliding-window rate limit of **100 requests per IP per minute**.

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | ISO 8601 timestamp when the window resets |

When the limit is exceeded the server responds with **429 Too Many Requests**:

```json
{ "error": "Too many requests. Please try again later." }
```

---

## Error Responses

All error responses share this shape:

```json
{ "error": "Human-readable description of what went wrong" }
```

| Status | Meaning |
|---|---|
| `400` | Validation error — fix the request body |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error (PostgreSQL) |
| `503` | MongoDB unavailable |

---

## Tools

### `GET /api/tools`

Returns the catalog of built-in tools available to agents.

**Response 200**

```json
[
  {
    "id": "calculator",
    "label": "Calculator",
    "kind": "client",
    "description": "Evaluate math expressions"
  }
]
```

---

## Agents

### `GET /api/agents`

Returns all agents ordered by most recently updated.

**Response 200** — array of agent objects (see shape below).

---

### `GET /api/agents/:id`

**Response 200**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Research Agent",
  "persona": "A helpful research assistant",
  "systemPrompt": "You are a helpful research assistant.",
  "model": "claude-sonnet-4-6",
  "tools": ["web_search", "calculator"],
  "positions": { "web_search": { "x": 100, "y": 200 } },
  "skills": ["skill-uuid-1"],
  "instructions": ["Always cite sources"],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Response 404** — `{ "error": "Agent not found" }`

---

### `POST /api/agents`

Creates a new agent.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name |
| `persona` | string | No | Agent role description |
| `systemPrompt` | string | No | Base system prompt |
| `model` | string | No | Model identifier |
| `tools` | string[] | No | Tool IDs to enable |
| `positions` | object | No | Canvas node positions |
| `skills` | string[] | No | Custom skill IDs |
| `instructions` | string[] | No | Ordered instruction list |

**Response 201** — created agent object.

**Response 400** — `{ "error": "Agent name is required" }`

---

### `PUT /api/agents/:id`

Replaces all fields of an existing agent.

**Response 200** — updated agent object.

**Response 404** — `{ "error": "Agent not found" }`

---

### `DELETE /api/agents/:id`

**Response 204** — no body.

**Response 404** — `{ "error": "Agent not found" }`

---

## Custom Skills

### `GET /api/skills`

Returns all custom skills ordered by creation date.

---

### `POST /api/skills`

Creates a custom skill.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `label` | string | Yes | Display name |
| `instruction` | string | Yes | Instruction text injected into agents |
| `description` | string | No | Short description |
| `color` | string | No | Hex badge color (default `#6366f1`) |

**Response 201** — created skill object.

---

### `PUT /api/skills/:id`

Updates a custom skill. **Response 200** — updated skill.

---

### `DELETE /api/skills/:id`

**Response 204** — no body. **Response 404** if not found.

---

## User Preferences

Preferences are stored per user in MongoDB. On a 503 response MongoDB is unreachable; the frontend should degrade gracefully.

### `GET /api/preferences/:userId`

Retrieves user preferences.

**Response 200**

```json
{
  "theme": "dark",
  "canvas_zoom": 1.2,
  "canvas_pan": { "x": -50, "y": 20 },
  "sidebar_width": 280
}
```

Returns `{}` when no preferences have been saved yet.

---

### `POST /api/preferences/:userId`

Saves (replaces) user preferences.

**Request body** — one or more of the following fields:

| Field | Type | Constraints |
|---|---|---|
| `theme` | string | `"light"`, `"dark"`, or `"system"` |
| `canvas_zoom` | number | 0.1 – 5 |
| `canvas_pan` | `{ x: number, y: number }` | both x and y required |
| `sidebar_width` | number | 0 – 2000 |

**Response 200**

```json
{
  "userId": "user-123",
  "preferences": {
    "theme": "dark",
    "canvas_zoom": 1.2,
    "canvas_pan": { "x": -50, "y": 20 },
    "sidebar_width": 280
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-06-01T12:00:00.000Z"
}
```

**Response 400** — validation error with descriptive message.

---

## Workspace State

Canvas state stored per workspace session in MongoDB.

### `GET /api/workspace/:workspaceId`

Retrieves workspace state.

**Response 200**

```json
{
  "selected_agent": "agent-uuid",
  "agent_positions": {
    "agent-uuid": { "x": 120, "y": 80 }
  },
  "active_tab": "canvas"
}
```

Returns `{}` when no state has been saved yet.

---

### `POST /api/workspace/:workspaceId`

Saves (replaces) workspace state.

**Request body** — one or more of the following fields:

| Field | Type | Constraints |
|---|---|---|
| `selected_agent` | string \| null | Agent ID or null |
| `agent_positions` | object | Map of agent ID to `{ x, y }` |
| `active_tab` | string | Active UI tab name |

**Response 200**

```json
{
  "workspaceId": "ws-default",
  "data": {
    "selected_agent": "agent-uuid",
    "agent_positions": {},
    "active_tab": "canvas"
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-06-01T12:00:00.000Z"
}
```

**Response 400** — validation error with descriptive message.

---

## Draft Agents

Unsaved agent configurations stored in MongoDB. Useful for auto-save / recovery.

### `GET /api/drafts/:workspaceId`

Retrieves all drafts for a workspace, newest first.

**Response 200**

```json
[
  {
    "id": "6670a1b2c3d4e5f6a7b8c9d0",
    "workspaceId": "ws-default",
    "agentData": {
      "name": "My Draft Agent",
      "tools": ["calculator"]
    },
    "createdAt": "2024-06-01T12:00:00.000Z",
    "updatedAt": "2024-06-01T12:00:00.000Z"
  }
]
```

Returns `[]` when no drafts exist for the workspace.

---

### `POST /api/drafts/:workspaceId`

Saves a new draft agent.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `agentData` | object | Yes | Agent configuration snapshot |

**Response 201**

```json
{
  "id": "6670a1b2c3d4e5f6a7b8c9d0",
  "workspaceId": "ws-default",
  "agentData": { "name": "My Draft Agent" },
  "createdAt": "2024-06-01T12:00:00.000Z",
  "updatedAt": "2024-06-01T12:00:00.000Z"
}
```

**Response 400** — `{ "error": "agentData is required and must be an object" }`

---

### `DELETE /api/drafts/:draftId`

Removes a draft by its MongoDB `_id`.

**Response 204** — no body.

**Response 400** — `{ "error": "Invalid draft ID format" }` (malformed ObjectId).

**Response 404** — `{ "error": "Draft not found" }`.

---

## Health Checks

### `GET /api/health`

PostgreSQL health check.

**Response 200** — `{ "ok": true }`  
**Response 503** — `{ "ok": false, "error": "..." }`

### `GET /api/health/mongo`

MongoDB health check.

**Response 200** — `{ "ok": true }`  
**Response 503** — `{ "ok": false, "error": "..." }`

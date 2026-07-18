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
| `401` | Unauthenticated — missing or invalid token, or bad credentials |
| `403` | Forbidden — authenticated but not the resource owner |
| `404` | Resource not found |
| `409` | Conflict — e.g. email already registered |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error (PostgreSQL) |
| `503` | MongoDB unavailable |

---

## Auth

Auth routes are rate-limited (same 100 req / IP / minute window as other limited routes). Tokens are JWTs signed with `JWT_SECRET`.

### `POST /api/auth/signup`

Creates a new user account and returns an access token.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Must contain `@`; stored normalized (trimmed, lowercase) |
| `password` | string | Yes | Minimum 8 characters |
| `display_name` | string | No | Human-readable name |

**Response 201**

```json
{
  "token": "<JWT access token>",
  "user": {
    "id": "cccccccc-0000-0000-0000-000000000001",
    "email": "alice@example.com",
    "displayName": "Alice",
    "authProvider": "local",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response 400** — validation error (invalid email, password too short, malformed body).

**Response 409** — `{ "error": "Email address is already registered" }`

---

### `POST /api/auth/login`

Authenticates an existing user and returns an access token.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Registered email address |
| `password` | string | Yes | Account password |

**Response 200**

```json
{
  "token": "<JWT access token>",
  "user": {
    "id": "cccccccc-0000-0000-0000-000000000001",
    "email": "alice@example.com",
    "displayName": "Alice",
    "authProvider": "local",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response 400** — validation error (missing/invalid email or password field).

**Response 401** — `{ "error": "Invalid email or password" }` (same message for unknown email and wrong password — no user enumeration).

---

### `GET /api/auth/me`

Returns the currently authenticated user. Requires a valid access token in the `Authorization` header.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 200** — user object (same shape as signup/login, no `password_hash`).

**Response 401** — missing header, invalid token, or user no longer exists.

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

Agent objects include `ownerId` (the user ID that created it), `visibility` (`"public"` or `"private"`), `forkedFrom` (source agent UUID or `null`), and `forkCount` (number of times this agent has been forked).

### `GET /api/agents` _(legacy)_

Returns all **public** agents ordered by most recently updated. No auth required. No subscription flags.

> **Decision:** The original endpoint returned every agent regardless of visibility, leaking private agents to unauthenticated callers. It is kept for back-compat but now scoped to `visibility = 'public'`. New clients should use `GET /api/agents/public` (adds `isSubscribed` when authenticated) or `GET /api/agents/mine` (owned + subscribed, with flags).

**Response 200** — array of agent objects (see shape below).

---

### `GET /api/agents/public`

Returns all public agents ordered by `updated_at DESC`. Accepts an optional Bearer token — when authenticated, each item includes an `isSubscribed` flag.

**Headers (optional)**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 200 — anonymous**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Research Agent",
    "visibility": "public",
    "ownerId": "cccccccc-0000-0000-0000-000000000001",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**Response 200 — authenticated** (same shape, plus `isSubscribed` on every item)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Research Agent",
    "visibility": "public",
    "ownerId": "cccccccc-0000-0000-0000-000000000001",
    "isSubscribed": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### `GET /api/agents/marketplace`

Public agent discovery endpoint with full-text search, composable filters, multiple sort orders, and offset pagination. Never returns private agents. Accepts an optional Bearer token — when authenticated each item includes `isSubscribed`, `isFavorited`, and `isOwner` flags.

**Headers (optional)**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Full-text search term (uses PostgreSQL `websearch_to_tsquery`) |
| `model` | string | — | Filter by exact model identifier |
| `tools` | string | — | Comma-separated tool IDs; returns agents that include **all** listed tools |
| `sort` | string | `recent` | `recent` \| `popular` \| `top_rated` \| `most_forked` |
| `minRating` | number | `0` | Minimum average star rating (0 = no filter) |
| `page` | integer | `1` | 1-based page number |
| `pageSize` | integer | `20` | Items per page (max 50) |

**Response 200**

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Research Agent",
      "persona": "A helpful research assistant",
      "model": "claude-sonnet-4-6",
      "tools": ["web_search", "calculator"],
      "ownerDisplayName": "Alice",
      "avgRating": 4.2,
      "ratingCount": 14,
      "forkCount": 3,
      "favoriteCount": 27,
      "isSubscribed": false,
      "isFavorited": false,
      "isOwner": false
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 42,
  "hasMore": true
}
```

`isSubscribed`, `isFavorited`, and `isOwner` are only present when the request is authenticated. `avgRating` is `null` when the agent has no ratings yet.

---

### `GET /api/agents/mine`

Returns the authenticated user's **owned agents** plus any **subscribed public agents**, ordered by `updated_at DESC`. Each item carries `isOwned` and `isSubscribed` boolean flags.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 200**

```json
[
  {
    "id": "aaaaaaaa-0000-0000-0000-000000000001",
    "name": "My Private Agent",
    "visibility": "private",
    "ownerId": "cccccccc-0000-0000-0000-000000000001",
    "isOwned": true,
    "isSubscribed": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  {
    "id": "bbbbbbbb-0000-0000-0000-000000000002",
    "name": "Someone's Public Agent",
    "visibility": "public",
    "ownerId": "dddddddd-0000-0000-0000-000000000002",
    "isOwned": false,
    "isSubscribed": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

**Response 401** — missing or invalid token.

---

### `GET /api/agents/:id`

Returns the agent if it is public, or if the requester is the owner.

**Headers (optional)**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

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
  "ownerId": "cccccccc-0000-0000-0000-000000000001",
  "visibility": "public",
  "forkedFrom": null,
  "forkCount": 3,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Response 403** — `{ "error": "Forbidden" }` (private agent, not the owner).

**Response 404** — `{ "error": "Agent not found" }`

---

### `POST /api/agents`

Creates a new agent. Requires authentication. The `owner_id` is set automatically from the token; `visibility` defaults to `"private"`.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

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
| `visibility` | string | No | `"public"` or `"private"` (default `"private"`) |

**Response 201** — created agent object (includes `ownerId` set to the authenticated user).

**Response 400** — `{ "error": "Agent name is required" }`

**Response 401** — missing or invalid token.

---

### `PUT /api/agents/:id`

Replaces all fields of an existing agent. Requires authentication and ownership.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 200** — updated agent object.

**Response 401** — missing or invalid token.

**Response 403** — `{ "error": "Forbidden" }` (authenticated but not the owner).

**Response 404** — `{ "error": "Agent not found" }`

---

### `PATCH /api/agents/:id`

Updates the **visibility** of an existing agent. This is the lightweight visibility toggle — use `PUT` to update other fields. Requires authentication and ownership.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `visibility` | string | Yes | `"public"` or `"private"` |

**Response 200** — full agent object with updated `visibility` and `updatedAt`.

**Response 400** — `{ "error": "visibility must be \"public\" or \"private\"" }`

**Response 401** — missing or invalid token.

**Response 403** — `{ "error": "Forbidden" }` (authenticated but not the owner).

**Response 404** — `{ "error": "Agent not found" }`

> **Note:** When an agent is made private, any existing subscriptions remain in the database but the agent is no longer returned from `GET /api/agents/public`. Subscribers lose access to the live agent until it is made public again.

---

### `DELETE /api/agents/:id`

Deletes an agent. Requires authentication and ownership.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 204** — no body.

**Response 401** — missing or invalid token.

**Response 403** — `{ "error": "Forbidden" }` (authenticated but not the owner).

**Response 404** — `{ "error": "Agent not found" }`

---

### `POST /api/agents/:id/subscribe`

Subscribes the authenticated user to a public agent. Idempotent — subscribing again returns 200 instead of an error. Emits a `subscribe` event to the activity log (best-effort; never blocks the response).

**Rules:**
- Only `visibility: "public"` agents are subscribable; private agents return 403.
- Subscribing to your own agent is allowed.
- The agent is never copied; subscribers always see the live version.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 200**

```json
{
  "userId": "cccccccc-0000-0000-0000-000000000001",
  "agentId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response 401** — missing or invalid token.

**Response 403** — `{ "error": "Cannot subscribe to a private agent" }`

**Response 404** — `{ "error": "Agent not found" }`

---

### `DELETE /api/agents/:id/subscribe`

Unsubscribes the authenticated user from an agent. Returns 404 when the subscription did not exist. Emits an `unsubscribe` event (best-effort).

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 204** — no body.

**Response 401** — missing or invalid token.

**Response 404** — `{ "error": "Subscription not found" }`

---

### `PUT /api/agents/:id/rating`

Submits or replaces the authenticated user's star rating for a public agent. Ratings are 1–5 integers; submitting again overwrites the previous value. Aggregates (`rating_sum`, `rating_count`) are updated on the `agents` row in the same transaction. Emits a `rate` event with `{ "rating": <value> }` in meta (best-effort).

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `rating` | integer | Yes | 1 – 5 |

**Response 200**

```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "cccccccc-0000-0000-0000-000000000001",
  "rating": 4
}
```

**Response 400** — `{ "error": "rating must be an integer between 1 and 5" }`

**Response 401** — missing or invalid token.

**Response 400** — `{ "error": "Cannot rate your own agent" }` (self-rating blocked at API layer).

**Response 403** — `{ "error": "Forbidden" }` — agent is private and not owned by caller.

**Response 404** — `{ "error": "Agent not found" }`

---

### `DELETE /api/agents/:id/rating`

Removes the authenticated user's rating for an agent. Aggregates are recomputed in the same transaction. Emits a `rate` event with null meta to signal removal (best-effort).

**Headers** — `Authorization: Bearer <token>`

**Response 204** — no body.

**Response 401** — missing or invalid token.

**Response 404** — `{ "error": "Agent not found" }` or `{ "error": "Rating not found" }`.

---

### `POST /api/agents/:id/favorite`

Adds a public (or caller-owned) agent to the authenticated user's favorites. Idempotent — a duplicate returns 409. Increments `favorite_count` atomically. Emits a `favorite` event (best-effort).

**Headers** — `Authorization: Bearer <token>`

**Response 200** — `{ "userId": "...", "agentId": "..." }`

**Response 401** — missing or invalid token.

**Response 403** — `{ "error": "Cannot favorite a private unowned agent" }`

**Response 404** — `{ "error": "Agent not found" }`

**Response 409** — `{ "error": "Already favorited" }`

---

### `DELETE /api/agents/:id/favorite`

Removes an agent from the authenticated user's favorites. Decrements `favorite_count` atomically (floor 0). Emits an `unfavorite` event (best-effort).

**Headers** — `Authorization: Bearer <token>`

**Response 204** — no body.

**Response 401** — missing or invalid token.

**Response 404** — `{ "error": "Agent not found" }` or `{ "error": "Not favorited" }`

---

### `GET /api/agents/favorites`

Returns a paginated list of agents the authenticated user has favorited, ordered by recency. Each item includes `isFavorited: true`, `isOwner`, `isSubscribed`, and `ownerDisplayName`.

**Headers** — `Authorization: Bearer <token>`

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | 1-based page number |
| `pageSize` | integer | `20` | Items per page (max 50) |

**Response 200**

```json
{
  "items": [{ "id": "...", "name": "...", "isFavorited": true, "isOwner": false, "isSubscribed": true }],
  "page": 1,
  "pageSize": 20,
  "total": 5,
  "hasMore": false
}
```

**Response 401** — missing or invalid token.

---

### `POST /api/agents/:id/export-event`

Records that a Markdown export was downloaded. Called client-side after the file is generated. Auth is optional — anonymous exports are recorded with `actor_id = null`. The response is always 204; failures in the event write are swallowed server-side and never returned to the caller.

**Headers (optional)**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 204** — no body.

**Response 404** — `{ "error": "Agent not found" }`

---

### `GET /api/agents/mine/analytics-summary`

Returns a per-agent analytics rollup for every agent owned by the authenticated user. Useful for a high-level dashboard overview. Requires authentication.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 200** — array ordered by `created_at DESC`

```json
[
  {
    "agentId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Research Agent",
    "subscriberCount": 42,
    "favoriteCount": 18,
    "forkCount": 3,
    "exportCount": 12,
    "avgRating": 4.2
  }
]
```

`avgRating` is `null` when the agent has no ratings. `exportCount` counts only `export` events recorded via `POST /api/agents/:id/export-event`.

**Response 401** — missing or invalid token.

---

### `GET /api/agents/:id/analytics`

Returns aggregate stats and the full subscriber list for a single agent. Owner-only — returns 403 when the authenticated user is not the owner.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Response 200**

```json
{
  "subscriberCount": 42,
  "favoriteCount": 18,
  "forkCount": 3,
  "exportCount": 12,
  "avgRating": 4.2,
  "ratingCount": 24,
  "subscribers": [
    {
      "displayName": "Alice",
      "subscribedAt": "2026-06-01T10:00:00.000Z"
    }
  ]
}
```

`avgRating` is `null` when `ratingCount` is 0. `subscribers` is ordered by `subscribed_at DESC`. Display names are shown but no email addresses are leaked.

**Response 401** — missing or invalid token.

**Response 403** — `{ "error": "Forbidden" }` — authenticated but not the owner.

**Response 404** — `{ "error": "Agent not found" }`

---

### `GET /api/agents/:id/analytics/timeline`

Returns a paginated activity timeline for a single agent, newest events first. Owner-only — returns 403 when the authenticated user is not the owner.

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | 1-based page number |
| `limit` | integer | `20` | Events per page (max 100) |

**Response 200**

```json
{
  "total": 87,
  "page": 1,
  "limit": 20,
  "events": [
    {
      "id": 1001,
      "type": "subscribe",
      "meta": null,
      "createdAt": "2026-06-28T09:15:00.000Z",
      "actorDisplayName": "Bob"
    },
    {
      "id": 1000,
      "type": "rate",
      "meta": { "rating": 5 },
      "createdAt": "2026-06-27T14:30:00.000Z",
      "actorDisplayName": null
    }
  ]
}
```

`actorDisplayName` is `null` for anonymous actions (e.g. unauthenticated exports). `meta` is `null` except for `rate` events (`{ "rating": 1–5 }` or `null` for removals) and `export` events (`{ "format": "markdown" }`). See the `agent_events` table in [database-schema.md](database-schema.md) for the full list of event types.

**Response 401** — missing or invalid token.

**Response 403** — `{ "error": "Forbidden" }` — authenticated but not the owner.

**Response 404** — `{ "error": "Agent not found" }`

---

### `POST /api/agents/:id/fork`

Creates an independent private copy of a public agent (or any agent owned by the caller) into the authenticated user's workspace. The source agent's `fork_count` is incremented atomically in the same transaction. The fork is a full snapshot — later edits to the source never affect the fork. Emits a `fork` event on the source agent (best-effort).

**Headers**

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

**Rules**
- The source must be `visibility: "public"` **or** owned by the caller. Any other private agent returns 403.
- Forking your own agent is allowed (useful for branching experiments).
- Skill IDs that are private and not owned by the caller are kept in the fork as-is but reported in `skillWarnings[]` so the caller knows they may not be resolvable.

**Response 201**

```json
{
  "id": "dddddddd-0000-0000-0000-000000000001",
  "name": "Research Agent (fork)",
  "persona": "A helpful research assistant",
  "systemPrompt": "You are a helpful research assistant.",
  "model": "claude-sonnet-4-6",
  "tools": ["web_search", "calculator"],
  "positions": { "web_search": { "x": 100, "y": 200 } },
  "skills": ["skill-uuid-1"],
  "instructions": ["Always cite sources"],
  "ownerId": "cccccccc-0000-0000-0000-000000000001",
  "visibility": "private",
  "forkedFrom": "550e8400-e29b-41d4-a716-446655440000",
  "forkCount": 0,
  "createdAt": "2026-06-28T00:00:00.000Z",
  "updatedAt": "2026-06-28T00:00:00.000Z",
  "skillWarnings": []
}
```

`skillWarnings` is always present. It is an empty array when all referenced skill IDs are public or owned by the caller; otherwise it contains the unresolvable skill UUIDs.

**Response 401** — missing or invalid token.

**Response 403** — `{ "error": "Forbidden" }` — source agent is private and not owned by the caller.

**Response 404** — `{ "error": "Agent not found" }`

---

## Custom Skills

Skills follow the same ownership/visibility model as agents. Each skill has an `owner_id` (set on creation) and a `visibility` of `"public"` or `"private"`. Public skills are visible to all users; private skills are only visible to their owner.

### Skill object

```json
{
  "id": "bbbbbbbb-0000-0000-0000-000000000001",
  "label": "Devil's Advocate",
  "color": "#6b21a8",
  "description": "Argues the opposing position",
  "instruction": "After acknowledging the user's point…",
  "ownerId": "cccccccc-0000-0000-0000-000000000001",
  "visibility": "public",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

When `isOwned` is present (authenticated endpoints only) it indicates whether the requesting user is the owner of that skill.

---

### `GET /api/skills`

Legacy endpoint. Returns all **public** skills ordered by creation date. No authentication required.

---

### `GET /api/skills/public`

Returns all public skills. No authentication required.

When called with a valid `Authorization` header each skill carries an `isOwned` boolean indicating whether the requesting user owns it.

---

### `GET /api/skills/mine`

Returns all skills owned by the authenticated user (both public and private). **Requires authentication.**

**Response 200** — array of skill objects, each with `isOwned: true`.

**Response 401** — missing or invalid token.

---

### `POST /api/skills`

Creates a custom skill. **Requires authentication.** The `owner_id` is set automatically from the token.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `label` | string | Yes | Display name |
| `instruction` | string | Yes | Instruction text injected into agents |
| `description` | string | No | Short description |
| `color` | string | No | Hex badge color (default `#6366f1`) |
| `visibility` | string | No | `"public"` or `"private"` (default `"private"`) |

**Response 201** — created skill object with `isOwned: true`.

**Response 401** — missing or invalid token.

---

### `PUT /api/skills/:id`

Updates a custom skill. **Requires authentication.** Only the owner may update a skill.

**Response 200** — updated skill object with `isOwned: true`.

**Response 401** — missing or invalid token.

**Response 403** — authenticated but not the owner.

**Response 404** — skill not found.

---

### `DELETE /api/skills/:id`

Deletes a custom skill. **Requires authentication.** Only the owner may delete a skill.

**Response 204** — no body.

**Response 401** — missing or invalid token.

**Response 403** — authenticated but not the owner.

**Response 404** — skill not found.

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

## Built-in Skills

Built-in skills live in MongoDB (`builtin_skills` collection). They are read-only for regular users and writable by admin users (`is_admin = true`).

### `GET /api/builtin-skills`

Returns all built-in skills. No authentication required.

**Response 200** — array of skill objects with `id`, `label`, `color`, `description`, `instruction`.

---

### `POST /api/builtin-skills`

Creates a new built-in skill. **Requires admin authentication.**

**Response 201** — created skill object.

**Response 403** — not an admin user.

---

### `PUT /api/builtin-skills/:id`

Updates a built-in skill by its `id` field. **Requires admin authentication.**

**Response 200** — updated skill object.

**Response 403** — not an admin user.

**Response 404** — skill not found.

---

### `DELETE /api/builtin-skills/:id`

Deletes a built-in skill. **Requires admin authentication.**

**Response 204** — no body.

**Response 403** — not an admin user.

**Response 404** — skill not found.

---

## Categories

Agent taxonomy categories. Public read, authenticated write.

### `GET /api/categories`

Returns all categories. No authentication required.

**Response 200**

```json
[
  { "id": "uuid", "slug": "research", "label": "Research", "color": "#6366f1", "createdAt": "..." }
]
```

---

### `POST /api/categories`

Creates a new category. **Requires authentication.**

**Request body:** `{ "slug": "my-cat", "label": "My Category", "color": "#hex" }`

**Response 201** — created category.

**Response 400** — invalid slug or missing required fields.

---

### `PUT /api/categories/:id`

Updates a category. **Requires authentication.**

**Response 200** — updated category.

**Response 404** — category not found.

---

### `DELETE /api/categories/:id`

Deletes a category. Agents with this `category_id` have it set to `NULL`. **Requires authentication.**

**Response 204** — no body.

**Response 404** — category not found.

---

## Persona Categories (MongoDB)

Persona categories are stored in MongoDB (`persona_categories` collection). Each category contains an array of persona objects.

### `GET /api/personas`

Returns all persona categories with their persona arrays. No authentication required.

---

### `POST /api/personas`

Creates a new persona category. **Requires authentication.**

---

### `PUT /api/personas/:categoryId`

Updates a persona category. **Requires authentication.**

---

### `DELETE /api/personas/:categoryId`

Deletes a persona category. **Requires authentication.**

---

### `POST /api/personas/:categoryId/personas`

Adds a persona to an existing category. **Requires authentication.**

---

## Agent Templates (MongoDB)

Templates are starter configurations stored in MongoDB (`agent_templates` collection).

### `GET /api/templates`

Returns all agent templates. No authentication required.

**Response 200** — array of template objects with `id`, `name`, `description`, `agentData`.

---

## Agent Versions

Immutable snapshots of agent state. One version is recorded per save or restore.

### `GET /api/agents/:id/versions`

Returns the version history for an agent (owner only), newest first.

**Headers** — `Authorization: Bearer <token>`

**Response 200**

```json
[
  {
    "id": 1,
    "agentId": "uuid",
    "versionNo": 3,
    "changeSummary": "Updated persona",
    "createdBy": "user-uuid",
    "createdAt": "2026-07-01T10:00:00Z"
  }
]
```

**Response 403** — not the owner.

**Response 404** — agent not found.

---

### `GET /api/agents/:id/versions/:versionNo`

Returns a single version snapshot including the full `snapshot` JSONB.

**Headers** — `Authorization: Bearer <token>`

**Response 200** — version object with `snapshot` field.

---

### `POST /api/agents/:id/versions/:versionNo/restore`

Restores an agent to a previous version. Creates a new version recording the restore. **Owner only.**

**Headers** — `Authorization: Bearer <token>`

**Response 200** — restored agent object.

**Response 403** — not the owner.

**Response 404** — agent or version not found.

---

## Agent Export

### `POST /api/agents/:id/export-mcp`

Generates an MCP (Model Context Protocol) bundle for the agent. Returns a ZIP file.

**Headers (optional)** — `Authorization: Bearer <token>`

**Response 200** — `application/zip` binary stream.

**Response 403** — private agent, not the owner.

**Response 404** — agent not found.

---

### `POST /api/agents/:id/export-format`

Exports the agent definition in a specific SDK format.

**Headers** — `Authorization: Bearer <token>`

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `format` | string | Yes | `"anthropic"` or `"openai"` |

**Response 200** — JSON payload formatted for the target SDK.

**Response 400** — invalid format.

**Response 403** — private agent, not the owner.

**Response 404** — agent not found.

---

### `POST /api/agents/validate`

Validates an agent definition without saving it. Useful for pre-save checks.

**Request body** — agent object (same shape as `POST /api/agents`).

**Response 200** — `{ "valid": true }` or `{ "valid": false, "errors": [...] }`.

---

## GitHub Sync Config

### `GET /api/agents/:id/github-sync-config`

Returns the GitHub sync configuration for an agent. **Owner only.**

**Response 200**

```json
{
  "owner": "myorg",
  "repo": "agent-configs",
  "branch": "main",
  "path": "agent.json",
  "autoPush": false
}
```

**Response 404** — no sync config exists for this agent.

---

### `PUT /api/agents/:id/github-sync-config`

Sets the GitHub sync configuration. **Owner only.** Requires a GitHub connection (`POST /api/integrations/github/connect`).

**Request body** — `{ "owner", "repo", "branch", "path", "autoPush" }`

**Response 200** — saved config.

---

### `DELETE /api/agents/:id/github-sync-config`

Removes the GitHub sync configuration. **Owner only.**

**Response 204** — no body.

---

## GitHub Integration

### `POST /api/integrations/github/connect`

Returns a GitHub OAuth authorization URL. The client should navigate to this URL.

**Headers** — `Authorization: Bearer <token>`

**Response 200** — `{ "url": "https://github.com/login/oauth/authorize?..." }`

---

### `GET /integrations/github/callback`

OAuth callback (browser redirect — no auth token, handled by browser navigation). Verifies CSRF state, exchanges code for token, encrypts and stores it, then redirects to the frontend at `{FRONTEND_URL}/settings?tab=integrations&github=connected`.

---

### `GET /api/integrations/github/status`

Returns the GitHub connection status for the authenticated user.

**Headers** — `Authorization: Bearer <token>`

**Response 200**

```json
{
  "connected": true,
  "githubLogin": "octocat",
  "scopes": "repo",
  "connectedAt": "2026-07-11T10:00:00Z"
}
```

The encrypted access token is never returned.

---

### `DELETE /api/integrations/github`

Disconnects GitHub — revokes the token at GitHub and deletes the row.

**Headers** — `Authorization: Bearer <token>`

**Response 204** — no body.

---

### `GET /api/integrations/github/repos`

Lists repositories accessible to the connected GitHub account.

**Headers** — `Authorization: Bearer <token>`

**Response 200** — array of `{ owner, name, fullName, defaultBranch, private }` objects.

**Response 400** — GitHub not connected.

---

### `GET /api/integrations/github/repos/:owner/:repo/branches`

Lists branches for a specific repository.

**Headers** — `Authorization: Bearer <token>`

**Response 200** — array of `{ name }` objects.

---

## Webhooks

### `GET /api/webhooks`

Returns all webhooks registered by the authenticated user.

**Headers** — `Authorization: Bearer <token>`

**Response 200** — array of webhook objects (secret field omitted).

---

### `POST /api/webhooks`

Registers a new webhook. The signing secret is returned **once** — store it securely.

**Headers** — `Authorization: Bearer <token>`

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | HTTPS URL to receive deliveries |
| `events` | string[] | Yes | Event names: `agent.subscribed`, `agent.shared`, `agent.forked` |

**Response 201**

```json
{
  "id": "webhook-uuid",
  "url": "https://your-server.example.com/webhook",
  "events": ["agent.subscribed", "agent.forked"],
  "active": true,
  "secret": "YOUR_SIGNING_SECRET_SHOWN_ONCE"
}
```

---

### `PUT /api/webhooks/:id`

Updates a webhook (URL, events, active state). Does not rotate the secret.

**Headers** — `Authorization: Bearer <token>`

**Response 200** — updated webhook (secret omitted).

---

### `DELETE /api/webhooks/:id`

Deletes a webhook and all delivery history.

**Headers** — `Authorization: Bearer <token>`

**Response 204** — no body.

---

### `GET /api/webhooks/:id/deliveries`

Returns delivery attempts for a webhook, newest first.

**Headers** — `Authorization: Bearer <token>`

**Response 200** — array of delivery objects with `id`, `event`, `statusCode`, `success`, `durationMs`, `createdAt`.

---

### `POST /api/webhooks/:id/test`

Enqueues a test delivery of a sample `agent.subscribed` event.

**Headers** — `Authorization: Bearer <token>`

**Response 200** — `{ "queued": true }`

---

## Quota

### `GET /api/me/quota`

Returns the authenticated user's quota usage for the current day.

**Headers** — `Authorization: Bearer <token>`

**Response 200**

```json
{
  "tier": "free",
  "usage": {
    "export": { "used": 3, "limit": 10 },
    "save": { "used": 12, "limit": 50 }
  },
  "resetsAt": "2026-07-06T00:00:00.000Z"
}
```

---

## Feature Flags

### `GET /api/feature-flags`

Returns current feature flag values. No authentication required.

**Response 200** — `{ "easyMode": false, ... }`

---

## Platform Stats

### `GET /api/stats`

Returns platform-wide aggregate statistics. No authentication required.

**Response 200**

```json
{
  "agentsPublished": 130,
  "forksMade": 42,
  "skillsShared": 17,
  "forksThisMonth": 8
}
```

- `agentsPublished` — count of agents with `visibility = 'public'`
- `forksMade` — sum of `fork_count` across all agents
- `skillsShared` — count of custom skills with `visibility = 'public'`
- `forksThisMonth` — fork events recorded in the current calendar month

---

## Server Metrics

### `GET /api/metrics`

Returns in-process performance counters and PostgreSQL pool state. No authentication required. Suitable for scraping by Prometheus, Grafana, or uptime monitors.

**Response 200**

```json
{
  "uptime_seconds": 3600,
  "requests_total": 150000,
  "errors_total": 12,
  "error_rate": "0.0001",
  "avg_duration_ms": 42,
  "pg_pool": {
    "total": 10,
    "idle": 7,
    "waiting": 0
  },
  "rate_limiter": {
    "tracked_ips": 23
  }
}
```

---

## Audit Log (Admin)

### `GET /api/audit`

Returns paginated audit log entries. **Requires admin authentication** (`is_admin = true`).

**Headers** — `Authorization: Bearer <token>`

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `entityType` | string | — | Filter by entity type (`agent`, `skill`) |
| `entityId` | UUID | — | Filter by specific entity ID |
| `actorId` | UUID | — | Filter by actor user ID |
| `limit` | integer | `50` | Max entries per page |
| `offset` | integer | `0` | Pagination offset |

**Response 200** — array of audit log rows (see [audit-log.md](audit-log.md) for schema).

**Response 403** — authenticated but `is_admin = false`.

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

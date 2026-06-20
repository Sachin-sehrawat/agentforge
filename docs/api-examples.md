# API Examples

Practical examples for every AgentForge endpoint. All examples assume the backend is running at `http://localhost:4000`.

For the full endpoint reference including field constraints and error codes, see [api.md](api.md).

---

## cURL Examples

### Auth

```bash
# Sign up
curl -X POST http://localhost:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"s3cr3tpassword","display_name":"Alice"}'

# Log in
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"s3cr3tpassword"}'

# Get current user (replace <token> with the JWT from signup/login)
curl http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

**Signup / Login response:**
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

---

### Health checks

```bash
# PostgreSQL health
curl http://localhost:4000/api/health

# MongoDB health
curl http://localhost:4000/api/health/mongo
```

---

### Tool catalog

```bash
# List all built-in tools
curl http://localhost:4000/api/tools
```

**Response:**
```json
[
  { "id": "calculator",   "label": "Calculator",   "kind": "client", "description": "Evaluate math expressions" },
  { "id": "code_runner",  "label": "Code Runner",  "kind": "client", "description": "Run sandboxed JavaScript" },
  { "id": "http_request", "label": "API Request",  "kind": "client", "description": "Call public HTTP APIs" },
  { "id": "web_search",   "label": "Web Search",   "kind": "server", "description": "Search the web" }
]
```

---

### Agents — CRUD

```bash
# List all agents (most recently updated first)
curl http://localhost:4000/api/agents

# Get a single agent
curl http://localhost:4000/api/agents/550e8400-e29b-41d4-a716-446655440000

# Create an agent
curl -X POST http://localhost:4000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Research Agent",
    "persona": "A thorough research assistant",
    "systemPrompt": "You are a helpful research assistant. Always cite your sources.",
    "model": "claude-sonnet-4-6",
    "tools": ["web_search", "calculator"],
    "skills": [],
    "instructions": ["Always cite sources", "Use bullet points for lists"]
  }'

# Update an agent (full replace)
curl -X PUT http://localhost:4000/api/agents/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Research Agent v2",
    "persona": "An expert research assistant",
    "systemPrompt": "You are an expert research assistant.",
    "model": "claude-opus-4-8",
    "tools": ["web_search"],
    "skills": [],
    "instructions": []
  }'

# Delete an agent
curl -X DELETE http://localhost:4000/api/agents/550e8400-e29b-41d4-a716-446655440000
```

---

### Custom Skills — CRUD

```bash
# List all custom skills
curl http://localhost:4000/api/skills

# Create a skill
curl -X POST http://localhost:4000/api/skills \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Concise Writer",
    "description": "Keeps responses short and direct",
    "instruction": "Always be concise. Use short sentences. Avoid filler words.",
    "color": "#6366f1"
  }'

# Update a skill
curl -X PUT http://localhost:4000/api/skills/9f8e7d6c-5b4a-3210-fedc-ba9876543210 \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Concise Writer",
    "description": "Keeps responses short and direct",
    "instruction": "Be concise. Use short sentences. No filler words. Bullet points preferred.",
    "color": "#8b5cf6"
  }'

# Delete a skill
curl -X DELETE http://localhost:4000/api/skills/9f8e7d6c-5b4a-3210-fedc-ba9876543210
```

---

### User Preferences

```bash
# Get preferences for a user
curl http://localhost:4000/api/preferences/user-123

# Save preferences (replaces all fields)
curl -X POST http://localhost:4000/api/preferences/user-123 \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "dark",
    "canvas_zoom": 1.2,
    "canvas_pan": { "x": -50, "y": 20 },
    "sidebar_width": 280
  }'

# Save only theme (other preferences preserved via upsert)
curl -X POST http://localhost:4000/api/preferences/user-123 \
  -H "Content-Type: application/json" \
  -d '{ "theme": "light" }'
```

---

### Workspace State

```bash
# Get workspace state
curl http://localhost:4000/api/workspace/ws-default

# Save workspace state
curl -X POST http://localhost:4000/api/workspace/ws-default \
  -H "Content-Type: application/json" \
  -d '{
    "selected_agent": "550e8400-e29b-41d4-a716-446655440000",
    "agent_positions": {
      "550e8400-e29b-41d4-a716-446655440000": { "x": 120, "y": 80 }
    },
    "active_tab": "canvas"
  }'
```

---

### Draft Agents

```bash
# List drafts for a workspace
curl http://localhost:4000/api/drafts/ws-default

# Save a draft
curl -X POST http://localhost:4000/api/drafts/ws-default \
  -H "Content-Type: application/json" \
  -d '{
    "agentData": {
      "name": "My Draft Agent",
      "tools": ["calculator"],
      "systemPrompt": "Work in progress..."
    }
  }'

# Delete a draft by its MongoDB ObjectId
curl -X DELETE http://localhost:4000/api/drafts/6670a1b2c3d4e5f6a7b8c9d0
```

---

## JavaScript / fetch Examples

### Auth

```js
const BASE = 'http://localhost:4000';

// Sign up a new user
const { token, user } = await fetch(`${BASE}/api/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'alice@example.com',
    password: 's3cr3tpassword',
    display_name: 'Alice',
  }),
}).then(r => r.json());

console.log(token); // JWT access token
console.log(user.id); // UUID assigned by the server

// Log in with existing credentials
const { token: loginToken } = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'alice@example.com', password: 's3cr3tpassword' }),
}).then(r => r.json());

// Fetch the current user
const me = await fetch(`${BASE}/api/auth/me`, {
  headers: { Authorization: `Bearer ${loginToken}` },
}).then(r => r.json());

console.log(me.email); // 'alice@example.com'
```

---

### Agents

```js
const BASE = 'http://localhost:4000';

// List agents
const agents = await fetch(`${BASE}/api/agents`).then(r => r.json());

// Create an agent
const agent = await fetch(`${BASE}/api/agents`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Agent',
    persona: 'A helpful assistant',
    systemPrompt: 'You are a helpful assistant.',
    model: 'claude-sonnet-4-6',
    tools: ['web_search'],
    skills: [],
    instructions: [],
  }),
}).then(r => r.json());

console.log(agent.id); // UUID assigned by the server

// Update an agent
await fetch(`${BASE}/api/agents/${agent.id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...agent, name: 'Renamed Agent' }),
});

// Delete an agent
await fetch(`${BASE}/api/agents/${agent.id}`, { method: 'DELETE' });
```

### Custom Skills

```js
// Create a skill
const skill = await fetch(`${BASE}/api/skills`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    label: 'JSON Responder',
    instruction: 'Always respond in valid JSON. No prose.',
    color: '#10b981',
  }),
}).then(r => r.json());

// Attach skill to an agent
await fetch(`${BASE}/api/agents/${agentId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...agent, skills: [skill.id] }),
});
```

### User Preferences

```js
const userId = 'user-123';

// Load preferences (returns {} if none saved yet)
const prefs = await fetch(`${BASE}/api/preferences/${userId}`)
  .then(r => r.ok ? r.json() : {});

// Save preferences
await fetch(`${BASE}/api/preferences/${userId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ theme: 'dark', canvas_zoom: 1.0 }),
});
```

### Workspace and drafts

```js
const workspaceId = 'ws-default';

// Save workspace state after the user moves an agent node
async function saveWorkspaceState(agentId, position) {
  await fetch(`${BASE}/api/workspace/${workspaceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selected_agent: agentId,
      agent_positions: { [agentId]: position },
      active_tab: 'canvas',
    }),
  });
}

// Auto-save a draft
async function saveDraft(agentData) {
  return fetch(`${BASE}/api/drafts/${workspaceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentData }),
  }).then(r => r.json());
}

// Delete a draft after confirming save
async function deleteDraft(draftId) {
  await fetch(`${BASE}/api/drafts/${draftId}`, { method: 'DELETE' });
}
```

---

## Common Workflows

### Workflow 1: Create an agent, attach a skill, export spec

```bash
# 1. Create the skill
SKILL=$(curl -s -X POST http://localhost:4000/api/skills \
  -H "Content-Type: application/json" \
  -d '{"label":"Markdown Writer","instruction":"Always format responses in Markdown.","color":"#6366f1"}')
SKILL_ID=$(echo $SKILL | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Create the agent with the skill attached
AGENT=$(curl -s -X POST http://localhost:4000/api/agents \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Doc Writer\",\"persona\":\"Technical writer\",\"model\":\"claude-sonnet-4-6\",\"tools\":[],\"skills\":[\"$SKILL_ID\"],\"instructions\":[]}")
AGENT_ID=$(echo $AGENT | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Created agent $AGENT_ID"

# 3. Retrieve the full agent record
curl http://localhost:4000/api/agents/$AGENT_ID
```

---

### Workflow 2: Verify migration — compare row counts

```bash
# Count rows in PostgreSQL after migration
PG_AGENTS=$(docker compose exec postgres psql -U agentforge -d agentforge -t \
  -c "SELECT COUNT(*) FROM agents;" | tr -d ' ')
PG_SKILLS=$(docker compose exec postgres psql -U agentforge -d agentforge -t \
  -c "SELECT COUNT(*) FROM custom_skills;" | tr -d ' ')

echo "PostgreSQL agents: $PG_AGENTS"
echo "PostgreSQL custom_skills: $PG_SKILLS"

# Confirm API returns the same count
API_AGENTS=$(curl -s http://localhost:4000/api/agents | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "API agents: $API_AGENTS"
```

---

### Workflow 3: Full backup before a deploy

```bash
cd backend

# Back up all three stores
node scripts/backup-sqlite.js
node scripts/backup-postgresql.js
node scripts/backup-mongodb.js

# Confirm backup files were created
ls -lh backups/postgresql/ | tail -1
ls -lh backups/mongodb/ | tail -1

# Verify PostgreSQL backup integrity
node scripts/rollback-migration.js \
  --pg-backup $(ls -t backups/postgresql/*.json | head -1) \
  --dry-run
```

---

### Workflow 4: User preference round-trip (JavaScript)

```js
const userId = `user-${Date.now()}`;

// Save
const saved = await fetch(`http://localhost:4000/api/preferences/${userId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ theme: 'dark', canvas_zoom: 1.5, sidebar_width: 300 }),
}).then(r => r.json());

console.assert(saved.preferences.theme === 'dark', 'theme should be dark');

// Load
const loaded = await fetch(`http://localhost:4000/api/preferences/${userId}`)
  .then(r => r.json());

console.assert(loaded.canvas_zoom === 1.5, 'zoom should persist');
```

---

## Error Handling Reference

| Status | When it occurs | How to handle |
|---|---|---|
| `400` | Missing required field or invalid value | Fix the request body; check the `error` message |
| `404` | Agent/skill/draft ID not found | Confirm the ID is correct; it may have been deleted |
| `429` | Rate limit exceeded on `/api/preferences`, `/api/workspace`, `/api/drafts` | Wait for `X-RateLimit-Reset`, then retry |
| `500` | Unexpected PostgreSQL error | Check backend logs; database may need attention |
| `503` | MongoDB unreachable | Preferences/workspace/drafts unavailable; core agent CRUD still works |

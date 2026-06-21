# AgentForge

A visual workbench for designing and documenting AI agents. Drag tool blocks onto
the canvas, configure the agent's persona and system prompt, attach custom skills,
and export the finished spec as Markdown — no AI provider required.

AgentForge is **provider-agnostic**: it defines *what* an agent should do, not
how to run it. The Markdown output can be handed off to any LLM runtime you choose.

## Architecture

AgentForge uses a dual-database backend:

```
Browser
  │
  ▼
React frontend  (no localStorage — all state via REST API)
  │  HTTP
  ▼
Express API  (port 4000)
  ├── pg pool ──────────► PostgreSQL 14  (port 5432)
  │   agents                persistent agent configurations
  │   custom_skills         reusable skill definitions
  │
  └── MongoClient ────────► MongoDB 7.0  (port 27017)
      user_preferences      per-user UI settings
      workspace_state       canvas layout and active tab
      draft_agents          auto-saved agent drafts
```

**PostgreSQL** stores structured, queryable agent data. **MongoDB** stores
ephemeral user and session state. If MongoDB is unreachable the API returns 503
on those endpoints only — core agent CRUD continues to work.

See [docs/migration-overview.md](docs/migration-overview.md) for the full
architecture rationale and migration history.

## Features

- **Canvas** — an "Agent core" node where you set the name, persona, system prompt, and model target.
- **Tool palette** — drag built-in tools (Calculator, Code Runner, API Request, Web Search) onto the canvas to wire them into the agent.
- **Custom skills** — create reusable skill definitions (label, description, instruction) and attach them to any agent.
- **Markdown export** — click **Export MD** in the top bar to download a Markdown spec of the agent's full configuration. The button is always visible (no login required) and enabled as soon as the agent has any content.
- **Saved agents** — agents are stored in PostgreSQL; reload or download them from the top bar at any time.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Docker](https://www.docker.com/) (for PostgreSQL and MongoDB via Docker Compose)

## Setup

### 1. Start databases

```bash
docker-compose up -d
```

This starts both **PostgreSQL 14** and **MongoDB 7.0**.

- The PostgreSQL init script in `backend/db/init/` runs automatically on first start and creates the `agents` and `custom_skills` tables. See [docs/database-schema.md](docs/database-schema.md) for the full schema.
- MongoDB collections (`user_preferences`, `workspace_state`, `draft_agents`) are created automatically when the backend starts. See [docs/database-schema.md](docs/database-schema.md#mongodb-collections) for the collection definitions.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # edit if your credentials differ from the defaults
npm start
```

The API server starts on `http://localhost:4000`. On startup it connects to both databases and ensures all MongoDB collections and indexes exist.

To load sample fixture data into MongoDB:

```bash
node backend/db/mongo-seed.js
```

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser (API calls are proxied to the backend).

## Using it

1. Give your agent a **name**, **persona**, and **system prompt** in the Agent core node.
2. Drag tools from the left sidebar onto the canvas. Each tool wires itself to the agent core automatically.
3. Open the **Skills** panel to attach reusable custom skills to the agent.
4. Click **Export MD** in the top bar to download a Markdown spec of the agent — works even before saving, with no login required.
5. Click **Save agent** to persist the agent to the database (login required).
6. Use **Saved agents** in the top bar to reload a previous agent. Each entry also has a **↓** button to re-download its Markdown spec.

## Project structure

```
agent-builder/
├── docker-compose.yml          # PostgreSQL 14 + MongoDB 7.0 + backend services
├── docs/
│   ├── migration-overview.md   # Architecture history, phases, key decisions
│   ├── database-schema.md      # PostgreSQL tables + MongoDB collections
│   ├── api.md                  # Full REST API reference
│   ├── api-examples.md         # cURL and JS fetch examples for every endpoint
│   ├── docker-setup.md         # Local Docker Compose setup guide
│   ├── deployment-guide.md     # Production deployment and monitoring
│   ├── migration-guide.md      # SQLite → PostgreSQL migration instructions
│   ├── migration-checklist.md  # Operator checklist for migration day
│   ├── disaster-recovery.md    # Backup scheduling and recovery procedures
│   ├── runbook.md              # Day-to-day operations and troubleshooting
│   └── testing-guide.md        # Running tests and coverage reports
├── backend/
│   ├── db/
│   │   ├── init/01_schema.sql  # PostgreSQL schema (auto-runs on first Docker start)
│   │   └── mongo-init/         # MongoDB init scripts
│   ├── scripts/                # backup-*.js, migrate-sqlite-to-pg.js, rollback-migration.js
│   ├── src/
│   │   ├── server.js           # Express server startup
│   │   ├── app.js              # Express app, routes, rate limiting
│   │   ├── db.js               # PostgreSQL pool connection
│   │   ├── mongo.js            # MongoDB client connection
│   │   ├── mongo-init.js       # MongoDB collection & index setup
│   │   ├── validation.js       # Input validation helpers
│   │   └── tools/
│   │       ├── calculator.js
│   │       ├── codeRunner.js
│   │       ├── httpRequest.js
│   │       └── toolDefinitions.js
│   └── .env.example
└── frontend/
    └── src/
        ├── App.jsx             # Root state management and layout
        ├── api.js              # Backend API client with cache and retry
        ├── toolMeta.jsx        # Icons, colors, blurbs per tool
        ├── useNodeDrag.jsx     # Drag-to-reposition hook
        └── components/
            ├── Topbar.jsx
            ├── Sidebar.jsx
            ├── Canvas.jsx
            ├── AgentNode.jsx
            ├── ToolNode.jsx
            ├── PersonaPanel.jsx
            ├── PersonaLibrary.jsx
            ├── SkillsBar.jsx
            ├── SkillsPage.jsx
            ├── AgentsPage.jsx
            ├── ChatPanel.jsx
            ├── TraceLog.jsx
            └── ErrorBoundary.jsx
```

## Adding a new tool

1. Add an executor function under `backend/src/tools/`.
2. Register it in `backend/src/tools/toolDefinitions.js` with a `label`, `kind`, optional `anthropicTool` schema, and `execute` function.
3. Add matching metadata (icon, color, blurb) in `frontend/src/toolMeta.jsx` and include the tool's id in `TOOL_ORDER`.

The canvas and wiring work generically off `agent.tools`, so new tools appear automatically once registered in both catalogs.

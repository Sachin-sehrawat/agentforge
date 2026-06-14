# AgentForge

A visual workbench for designing and documenting AI agents. Drag tool blocks onto
the canvas, configure the agent's persona and system prompt, attach custom skills,
and export the finished spec as Markdown — no AI provider required.

AgentForge is **provider-agnostic**: it defines *what* an agent should do, not
how to run it. The Markdown output can be handed off to any LLM runtime you choose.

## Features

- **Canvas** — an "Agent core" node where you set the name, persona, system prompt, and model target.
- **Tool palette** — drag built-in tools (Calculator, Code Runner, API Request, Web Search) onto the canvas to wire them into the agent.
- **Custom skills** — create reusable skill definitions (label, description, instruction) and attach them to any agent.
- **Markdown export** — click **Save agent** to download a Markdown spec of the agent's full configuration, or use the **Export MD** button when an agent is loaded.
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
- MongoDB collections (`user_preferences`, `workspace_data`, `draft_agents`) are created automatically when the backend starts. See [docs/mongodb-schema.md](docs/mongodb-schema.md) for the full schema.

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
4. Click **Save agent** — a Markdown file of the agent spec downloads automatically.
5. Use **Saved agents** in the top bar to reload a previous agent. Each entry also has a **↓** button to re-download its Markdown spec.

## Project structure

```
agent-builder/
├── docker-compose.yml          # PostgreSQL 14 + MongoDB 7.0 services
├── docs/
│   ├── database-schema.md      # PostgreSQL table definitions
│   └── mongodb-schema.md       # MongoDB collection definitions
├── backend/
│   ├── db/
│   │   ├── init/
│   │   │   └── 01_schema.sql   # PostgreSQL schema (run by Docker on first start)
│   │   └── mongo-seed.js       # MongoDB fixture data seed script
│   ├── src/
│   │   ├── server.js           # Express app & REST API
│   │   ├── db.js               # PostgreSQL pool connection
│   │   ├── mongo.js            # MongoDB client connection
│   │   ├── mongo-init.js       # MongoDB collection & index setup
│   │   └── tools/
│   │       ├── calculator.js
│   │       ├── codeRunner.js
│   │       ├── httpRequest.js
│   │       └── toolDefinitions.js
│   └── .env.example
└── frontend/
    └── src/
        ├── App.jsx             # Top-level state & layout
        ├── api.js              # Backend API client
        ├── toolMeta.jsx        # Icons, colors, blurbs per tool
        ├── useNodeDrag.jsx     # Drag-to-reposition hook
        └── components/
            ├── Topbar.jsx
            ├── Sidebar.jsx
            ├── Canvas.jsx
            ├── AgentNode.jsx
            ├── ToolNode.jsx
            ├── PersonaLibrary.jsx
            └── Skills.jsx
```

## Adding a new tool

1. Add an executor function under `backend/src/tools/`.
2. Register it in `backend/src/tools/toolDefinitions.js` with a `label`, `kind`, optional `anthropicTool` schema, and `execute` function.
3. Add matching metadata (icon, color, blurb) in `frontend/src/toolMeta.jsx` and include the tool's id in `TOOL_ORDER`.

The canvas and wiring work generically off `agent.tools`, so new tools appear automatically once registered in both catalogs.

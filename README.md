# AgentForge

A visual workbench for building tool-using AI agents. Drag tool blocks onto
the canvas, wire them up to an "agent core," configure its persona, and test
it live in a chat panel — watch a glowing pulse travel along the wires every
time your agent reaches for a tool.

This is a learning/demo project: a small full-stack app (React + Node +
SQLite) that calls the real Anthropic API so the agents you build actually
work.

## What it does

- **Canvas**: an "Agent core" node where you set the name, persona, system
  prompt, and model.
- **Tool palette**: drag any of these onto the canvas to wire them into the
  agent:
  - **Web Search** — Claude's built-in web search tool.
  - **Calculator** — evaluates math expressions.
  - **Code Runner** — runs a short JS snippet in a sandbox.
  - **API Request** — makes an HTTP request to a public URL.
- **Test panel**: chat with your agent. When it calls a tool, you'll see a
  pulse travel from the agent node to that tool's node on the canvas, and a
  matching entry appear in the trace log.
- **Save / load**: agents are stored in a local SQLite database so you can
  come back to them later.

## Setup

You'll need [Node.js](https://nodejs.org/) 18+ and an
[Anthropic API key](https://console.anthropic.com/).

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
npm start
```

This starts the API server on `http://localhost:4000` and creates a local
`agents.db` SQLite file the first time it runs.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

This starts the dev server on `http://localhost:5173` (it proxies `/api`
requests to the backend). Open that URL in your browser.

## Using it

1. Give your agent a **name** and **persona** (e.g. "A friendly trip planner
   who double-checks facts before answering").
2. Drag tools from the left sidebar onto the canvas. Each one wires itself to
   the agent core automatically.
3. Type a message in the **Test your agent** panel. Try something that
   should trigger a tool, e.g.:
   - With Calculator wired up: *"What's 1234 * 5678?"*
   - With Web Search wired up: *"What's the weather like in Tokyo today?"*
   - With Code Runner wired up: *"Use code to find all primes under 50."*
   - With API Request wired up: *"Look up the current price of Bitcoin from
     a public API."*
4. Watch the **Tool activity** log on the right and the pulse on the canvas
   as the agent works.
5. Click **Save agent** to store your configuration, or **New** to start
   fresh. Use **Saved agents** in the top bar to reload or delete agents.

## How it works

- The frontend sends the agent's configuration (persona, system prompt,
  model, enabled tools) plus the conversation so far to `POST /api/run`.
- The backend builds a system prompt from the persona + system prompt, maps
  the enabled tools to Anthropic tool definitions, and calls the Anthropic
  Messages API.
- If the model calls a **client-side tool** (Calculator, Code Runner, API
  Request), the backend executes it locally and sends the result back to the
  model, looping until the model produces a final text reply.
- **Web Search** is Anthropic's built-in server-side tool — Claude executes
  it itself, and the backend just reports it in the trace.
- The full trace of tool calls (inputs and outputs) is returned to the
  frontend, which plays it back step-by-step to drive the pulse animation and
  trace log.

## Security notes (read before exposing this publicly)

This project is built for **local, single-user, educational use**. A few
things to be aware of if you extend it:

- **Code Runner** uses Node's built-in `vm` module with a short timeout and a
  minimal sandbox. This is *not* a true security boundary — a determined user
  could still find ways to misbehave. Don't expose this to untrusted users.
- **API Request** blocks requests to localhost and common private IP ranges
  (`10.x`, `172.16-31.x`, `192.168.x`, link-local), but it can still reach
  arbitrary public URLs and return their responses to the model.
- There's no authentication — anyone who can reach the backend can run agents
  using your API key and read/write saved agents.

## Extending it

To add a new tool:

1. Add an executor function under `backend/src/tools/`.
2. Register it in `backend/src/tools/toolDefinitions.js` with an Anthropic
   tool schema (`name`, `description`, `input_schema`) and `execute` function.
3. Add matching metadata (icon, color, blurb) in
   `frontend/src/toolMeta.jsx`, and add the tool's id to `TOOL_ORDER`.

The canvas, wiring, drag-and-drop, and trace log all work generically off of
`agent.tools`, so a new tool just needs to show up in both catalogs.

## Project structure

```
agent-builder/
├── backend/
│   ├── src/
│   │   ├── server.js          # Express app & REST API
│   │   ├── db.js               # SQLite setup
│   │   ├── agentRunner.js       # Tool-use loop against the Anthropic API
│   │   └── tools/
│   │       ├── calculator.js
│   │       ├── codeRunner.js
│   │       ├── httpRequest.js
│   │       └── toolDefinitions.js
│   └── .env.example
└── frontend/
    └── src/
        ├── App.jsx              # Top-level state & layout
        ├── api.js                # Backend API client
        ├── toolMeta.jsx          # Icons, colors, blurbs per tool
        ├── useNodeDrag.jsx       # Drag-to-reposition hook
        └── components/
            ├── Topbar.jsx
            ├── Sidebar.jsx
            ├── Canvas.jsx
            ├── AgentNode.jsx
            ├── ToolNode.jsx
            ├── ChatPanel.jsx
            └── TraceLog.jsx
```

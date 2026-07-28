# AgentForge — Project Context

A provider-agnostic visual agent builder: users design AI agents on a canvas (nodes for the agent, tools, personas, skills) and export them as Markdown, an MCP server, or provider-specific formats (Anthropic, OpenAI, Slack). No AI runtime is required to use the builder itself — it's a design/export tool, not a hosted agent runtime.

## Repo layout

```
agent-builder/
├── backend/            Express API (Node, ESM)
├── frontend/           React 18 + Vite SPA
├── vscode-extension/   VS Code extension — browse/export agents from the editor
├── mcp-connector/      Standalone MCP server exposing AgentForge as Claude tools
├── docs/               23 markdown docs (API, deployment, auth, migrations, runbooks)
├── docker-compose.yml  postgres + mongodb + backend + frontend
├── performance/        perf-testing artifacts
├── scripts/            repo-level scripts
└── .github/            CI workflows
```

There is no root `package.json` — each app (`backend/`, `frontend/`, `vscode-extension/`, `mcp-connector/`) is managed independently with its own dependencies and scripts.

## Backend (`backend/`)

- **Stack**: Express 4, ESM (`"type": "module"`), tested with Vitest (90% coverage threshold).
- **Entry point**: `backend/src/server.js` starts the server; almost all routes and logic live in one large file, `backend/src/app.js` (~3.2k lines) — there's no separate `routes/`/`controllers/` split despite the folder names elsewhere.
- **Route groups**: `/api/agents` (CRUD, versions, fork, duplicate, favorite, rating, subscribe, export-mcp, export-format, analytics), `/api/skills`, `/api/templates`, `/api/builtin-skills`, `/api/personas`, `/api/categories`, `/api/admin/users`, `/api/audit`, `/api/webhooks`, `/api/integrations/github/*`, `/api/subscriptions`, `/api/auth/{signup,login,me}`, `/api/feature-flags`, `/api/preferences`, `/api/workspace`, `/api/drafts`, `/api/health`, `/api/metrics`, `/api/stats`, `/api/docs/:filename`.
- **Folders**:
  - `auth/` — `crypto.js`, `token.js` (JWT sign/verify)
  - `middleware/` — `auth.js` (`requireAuth`/`optionalAuth`), `quota.js` (`enforceQuota`)
  - `export/` — `toAnthropic.js`, `toOpenAI.js`, `toolSchemas.js`, `slackValidation.js`
  - `serialization/` — `agentSchema.js`, `importAgent.js`, `mcpExport.js`
  - `integrations/` — `github.js` (OAuth + repo sync)
  - `tools/` — built-in tool catalog (`calculator.js`, `codeRunner.js`, `httpRequest.js`, `toolDefinitions.js`)
  - Root files: `db.js` (Postgres pool), `mongo.js`/`mongo-init.js`, `validation.js`, `audit.js`, `agentRunner.js`, `featureFlags.js`, `quotaConfig.js`, `jobs.js`, `worker.js`, `webhookDelivery.js`
  - `db/init/01_schema.sql` — Postgres schema, auto-run by Docker on first boot
  - `scripts/` — migration/backup scripts (`migrate-sqlite-to-pg.js`, `rollback-migration.js`, `backup-*.js`)
- **Data stores** (dual-database, per `docker-compose.yml`):
  - **PostgreSQL 14** — `agents`, `custom_skills` (structured, queryable data)
  - **MongoDB 7.0** — `user_preferences`, `workspace_state`, `draft_agents` (ephemeral/session state). If Mongo is down, only Mongo-backed endpoints 503 — core agent CRUD keeps working.
- **Auth**: JWT (`jsonwebtoken` + `bcryptjs`). `requireAuth`/`optionalAuth` read `Authorization: Bearer <token>`; a `?token=` query-param fallback was added recently for contexts where setting headers is awkward (e.g. VS Code webviews, doc previews).
- **MCP export**: `POST /api/agents/:id/export-mcp` + `serialization/mcpExport.js` generate a downloadable MCP server package from an agent — distinct from the standalone `mcp-connector/` app below.
- **GitHub integration**: OAuth connect flow with encrypted token storage (`integrations/github.js`), plus per-agent repo/branch/path sync config. Sync is now bidirectional (not just config scaffolding, not just one-way push):
  - **Push (agent → GitHub)**: `src/githubSync.js` is a background-job handler that pushes an agent's canonical JSON to the configured repo via the GitHub Contents API (`getFileContents`/`putFileContents` in `integrations/github.js`), triggered either explicitly (`POST /api/agents/:id/github-sync`) or automatically on save when `auto_sync` is enabled (enqueued from `PUT /api/agents/:id`, never blocking the save).
  - **Pull (GitHub → agent)**: `src/githubReconcile.js` is a background-job handler triggered by an inbound webhook receiver (`POST /api/integrations/github/webhook`, HMAC-verified via `X-Hub-Signature-256`, no auth header — GitHub calls it). Reacts to `push` events on the tracked branch; loop-prevention skips AgentForge's own echoed commits (via `last_synced_commit_sha`); if the agent hasn't diverged locally since the last sync, the incoming change applies cleanly (new `agents` row + `agent_versions` entry); if it has, the incoming content is recorded as a new version flagged `'GitHub conflict — review required'` (`last_sync_status: 'conflict'`) rather than auto-merged — resolved manually via `VersionHistoryPanel.jsx`. Webhook registration is automatic on first `PUT /api/agents/:id/github-sync-config` for a repo, but only activates when **`APP_BASE_URL`** env var is set (skipped silently otherwise — GitHub can't reach `localhost`). Per-repo webhook secrets live encrypted in `github_repo_webhooks`.
  - Status exposed via `GET /api/agents/:id/github-sync-status` (`{state, repo, path, fileUrl, syncedAt, errorMessage}`, state ∈ `pending|ok|error|conflict`).
  - The git-tracked file is always the canonical JSON envelope (not Markdown), since AgentForge's Markdown parser can't losslessly recover `skills`/`instructions`/`tags` IDs on round-trip — `parseJson()` in `serialization/importAgent.js` was extended to also round-trip `tags` (was silently dropped before, which would have caused spurious reconcile diffs).
  - New tables/columns: `db/init/21_agent_github_sync_status.sql`, `22_github_repo_webhooks.sql`, `23_agent_github_sync_conflict_status.sql`. Full details in `docs/github-integration.md`.
- **Quotas**: per-route `enforceQuota` middleware; see `docs/quota-policy.md` and `docs/quota-scaling.md`.
- **Known deployment gotcha**: Postgres init scripts in `db/init/*.sql` only run once, on a fresh volume — rebuilding the backend/frontend images does *not* re-run new migrations against an already-initialized dev Postgres volume. New migrations must be applied manually (`docker compose exec postgres psql ... < db/init/NN_*.sql`) to existing local/dev databases, same as documented for production in `docs/migration-overview.md`.

## Frontend (`frontend/`)

- **Stack**: React 18 + Vite 5, Vitest + Testing Library for tests. No router or global state library — state flows through REST calls, not localStorage.
- **Entry**: `src/main.jsx` → `src/App.jsx` (root layout/state). API client: `src/api.js` (with caching/retry).
- **Context providers**: `AuthContext.jsx`, `FeatureFlagsContext.jsx`.
- **`src/components/`** (flat, ~30 top-level + subfolders):
  - `landing/` — `Hero`, `FeatureGrid`, `HowItWorks`, `IntegrationsSection` (MCP connector promo), `MarketplaceBand`/`Strip`, `StatsBar`, `TemplateGallerySection`, `Testimonials`, `LandingFooter`, `FinalCta`
  - `mobile/` — `MobileLandingPage`, `MobileHero3D`
  - `docs/` — `DocsPage`, `DocViewer`, `WebhookSignaturesDoc` (renders backend `/api/docs/:filename`)
  - Core features — `Canvas`, `AgentNode`, `ToolNode`, `AgentsPage`, `MarketplacePage`, `PersonasPage`, `SkillsPage`, `AdminPage`, `AgentAnalytics`, `AuthModal`, `Topbar`, `Sidebar`, `ChatPanel`, `TraceLog`, `GitHubConnectPanel`, `GitHubSettings`, `McpConnectPanel`, `WebhookSettings`, `ExportFormatModal`, `ImportModal`, `TemplateGallery`, `VersionHistoryPanel`, `QuotaUpgradeModal`, `ValidationPanel`, `ShortcutsOverlay`, `CalendarPicker`
- `src/export/` and `src/serialization/` mirror the backend's converters/schema validation client-side.
- `src/data/` — static seed data: `personas.js`, `skills.js`, `templates.js`, `slackProfile.js`.
- `src/hooks/` — `useHistory.jsx` (undo/redo — gated by agent ownership), `useIsMobile.jsx`, `useInViewport`, `useNodeDrag.jsx`.
- **Fixed bug**: `AgentGitHubSyncModal` (in `AgentsPage.jsx`) read `r.full_name`/`b.name` for the repo/branch pickers, but the backend actually returns `fullName` (camelCase object field) for repos and a plain array of branch-name strings for branches — so both dropdowns silently rendered empty options. Fixed to read `r.fullName` and the branch string directly.

## vscode-extension/

VS Code extension for **browsing, managing, and exporting** AgentForge agents without leaving the editor (agent creation/editing still happens in the web canvas).

- `package.json`: name `agentforge-vscode`, entry `src/extension.js`, requires VS Code `^1.85.0`. Contributes a "My Agents" activity-bar view and commands: `signIn`, `signOut`, `refreshAgents`, `viewAgent`, `deleteAgent`, `exportMarkdown`, `exportMcp`.
- `src/`: `extension.js` (activation), `agentsProvider.js` (TreeDataProvider), `agentCommands.js`, `api.js` (backend HTTP client), `auth.js` (JWT stored in VS Code `SecretStorage`, never plaintext), `config.js` (`agentforge.apiUrl` setting, default `http://localhost:4000`), `markdown.js`, `toolMeta.js`.
- No npm scripts — run via F5 (Extension Development Host).

## mcp-connector/ (repo root, standalone)

A real Model Context Protocol server (`@modelcontextprotocol/sdk`, Express 5) for Claude Desktop/Claude Code, exposing ~20 tools (list/search/create/update/delete/fork agents, skills, personas, templates) against the AgentForge backend API.

- Entry: `src/index.js`; `src/client.js` handles backend auth via env vars (`AGENTFORGE_BASE_URL`, `AGENTFORGE_EMAIL`/`AGENTFORGE_PASSWORD`, or `AGENTFORGE_JWT_TOKEN`).
- Scripts: `start` (stdio transport), `start:http` (HTTP transport).
- This is what the frontend's `IntegrationsSection`/`McpConnectPanel` surface and help configure in-app.

## Infrastructure

`docker-compose.yml` runs 4 services on network `agentforge-net`: `postgres`, `mongodb`, `backend` (built from `backend/Dockerfile`, healthcheck on `/api/health`), `frontend` (built via `frontend/Dockerfile`, multi-stage: Vite build → nginx, served on port 80). Backend and frontend bake source into their images — code changes require `docker compose up -d --build`, not just a restart. Compose vars come from `.env.local` (must be passed via `--env-file .env.local` or copied to `.env`, since Compose doesn't auto-load `.env.local`).

## docs/ folder

23 files covering API reference, auth, database schema, deployment/runbooks, disaster recovery, migrations, quotas, testing, and webhook signatures. Mounted read-only into the backend container and served at `/api/docs/:filename`, rendered in-app by `DocViewer.jsx`. Notable: root `README.md`'s "project structure" section is stale — it predates `mcp-connector/`, `vscode-extension/`, and several backend/frontend folders listed above; this file should be treated as the more current source of truth.

## Recent direction (see `git log`)

Core canvas/export → multi-format export (Anthropic/OpenAI/Slack) → GitHub integration (OAuth, encrypted tokens, per-agent sync config) → mobile-responsive UI + personas page → MCP connector (standalone server + in-app export target) → VS Code extension → landing-page Integrations section + ownership-gated collaboration guardrails (History/Save restricted to owners, non-owners redirected to Fork) → **in progress: pivot toward a git-native agent registry** (see below).

The project is evolving from a single-user visual builder toward a multi-surface platform (web, VS Code, MCP/Claude) with external integrations (GitHub, Slack) and collaboration/marketplace features (fork provenance, ownership gating, ratings).

## Active pivot: git-native agent registry

Repositioning away from "visual agent builder" (crowded market, e.g. n8n/Flowise/LangFlow) toward a git-native registry combining (A) GitOps for teams — agent specs version-controlled in the team's own GitHub repo with PR-based review — and (B) a curated public marketplace with fork provenance/lineage ("used by N teams"). Phased plan, each phase independently demoable:

- **Phase 0 (done)**: Fixed a real access-control gap found during investigation — `POST/PUT/DELETE /api/templates` only checked `requireAuth`, not admin; now gated by the existing `requireSuperuser` middleware.
- **Phase 1 (done)**: One-way push GitOps (agent → GitHub). Described above under Backend/GitHub integration.
- **Phase 2 (done)**: Bidirectional sync — a GitHub webhook receiver reacts to pushes on the tracked branch (i.e. after a human merges a PR editing the agent's file on GitHub) and reconciles changes back into `agents`/`agent_versions`, with loop-prevention (skip AgentForge's own echoed pushes) and a conflict path (surface a review banner via the existing `VersionHistoryPanel.jsx` diff UI rather than silently overwriting either side). Described above under Backend/GitHub integration. Requires `APP_BASE_URL` env var (publicly reachable URL) for webhook auto-registration to activate — not yet set in local dev, so this is unit-tested but not yet manually verified end-to-end against a live GitHub webhook delivery.
- **Phase 3 (not started)**: Marketplace fork-lineage. Today `agents.forked_from` is a single-parent pointer with no tree query and no "used by N" aggregate distinguishing forks from subscribers. Plan: recursive-CTE ancestor/descendant queries + a new `subscriber_count` column, exposed via a new `GET /api/agents/:id/lineage` route.

Full phased plan with file-level detail: `C:\Users\sachi\.claude\plans\idempotent-giggling-sphinx.md` (local plan file, not in the repo).

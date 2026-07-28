# GitHub Integration

AgentForge supports connecting a GitHub account via OAuth 2.0. The access token is stored **encrypted at rest** and **never returned to the client**.

---

## OAuth App Setup

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in the form:
   - **Application name**: AgentForge (or any name)
   - **Homepage URL**: your deployment URL (e.g. `https://agentforge.example.com`)
   - **Authorization callback URL**: `https://agentforge.example.com/integrations/github/callback`
     - For local dev: `http://localhost:4000/integrations/github/callback`
3. Click **Register application**.
4. Copy **Client ID** → `GITHUB_CLIENT_ID` in `.env`.
5. Generate a **Client Secret** → `GITHUB_CLIENT_SECRET` in `.env`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GITHUB_CLIENT_ID` | Yes | OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Yes | OAuth App Client Secret (never commit this) |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Yes | 64-character hex string (32 bytes) used for AES-256-GCM encryption |
| `FRONTEND_URL` | No | Frontend origin for post-OAuth redirects (default: `http://localhost:5173`) |

Generate the encryption key:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## OAuth Scope

The connect flow requests the **`repo`** scope, which grants:

- Read/write access to public and private repositories
- Ability to commit files

If your use case only involves public repositories, you can change the scope to **`public_repo`** in [backend/src/app.js](../backend/src/app.js) (the `startGitHubConnect` route).

---

## Encryption Scheme

GitHub access tokens are encrypted with **AES-256-GCM** before being written to the database.

**Storage format** (stored as PostgreSQL `BYTEA`):

```
| IV (12 bytes) | Auth Tag (16 bytes) | Ciphertext (variable) |
```

- A fresh random 12-byte IV is generated for every upsert.
- The GCM auth tag provides authenticated encryption — any tampering is detected on decryption.
- The raw token is **never** written to any log, response body, or DB column in plaintext.
- The key lives exclusively in the `GITHUB_TOKEN_ENCRYPTION_KEY` environment variable.

Implementation: [backend/src/integrations/github.js](../backend/src/integrations/github.js)

---

## Key Rotation Procedure

If `GITHUB_TOKEN_ENCRYPTION_KEY` is rotated:

1. All existing `github_connections` rows become unreadable (decryption will throw).
2. To rotate without service disruption:
   a. Add `GITHUB_TOKEN_ENCRYPTION_KEY_OLD=<old key>` to env.
   b. Write a one-time migration script that reads each row using the old key and re-encrypts with the new key.
   c. Remove `GITHUB_TOKEN_ENCRYPTION_KEY_OLD` after migration completes.
3. Alternatively: force all users to re-connect (DELETE all rows), then rotate the key.

---

## API Endpoints

### Initiate connect

```
POST /api/integrations/github/connect
Authorization: Bearer <jwt>
```

Returns `{ url: "https://github.com/login/oauth/authorize?..." }`. The client should navigate to this URL. The `state` parameter embedded in the URL is a one-time CSRF token that expires in 10 minutes.

### OAuth callback (browser redirect, no auth required)

```
GET /integrations/github/callback?code=<code>&state=<state>
```

Handled server-side only. Verifies the CSRF state, exchanges the code for a token (server-to-server), encrypts the token, upserts the `github_connections` row, then redirects the browser to:

```
{FRONTEND_URL}/settings?tab=integrations&github=connected
```

or on failure:

```
{FRONTEND_URL}/settings?tab=integrations&github=error&msg=<reason>
```

### Status

```
GET /api/integrations/github/status
Authorization: Bearer <jwt>
```

Response:

```json
{
  "connected": true,
  "githubLogin": "octocat",
  "scopes": "repo",
  "connectedAt": "2026-07-11T10:00:00Z"
}
```

The access token and encrypted bytes are **never** included in this response.

### Disconnect

```
DELETE /api/integrations/github
Authorization: Bearer <jwt>
```

Calls [GitHub's token revocation endpoint](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token) before deleting the row. Returns `204 No Content`.

---

## Per-Agent Sync

Once an account is connected, individual agents can be configured to sync their canonical JSON spec to a file in a GitHub repo.

### Configure sync for an agent

```
GET/PUT/DELETE /api/agents/:id/github-sync-config
Authorization: Bearer <jwt>   (owner only)
```

`PUT` body:

```json
{
  "repo_full_name": "acme/agents-repo",
  "branch": "main",
  "path_template": "agents/{slug}.json",
  "auto_sync": true,
  "format": "json"
}
```

`path_template` supports a `{slug}` placeholder, rendered from the agent's name (lowercased, non-alphanumeric runs collapsed to `-`; falls back to the agent's id if the name has no alphanumeric characters).

### Trigger a sync

```
POST /api/agents/:id/github-sync
Authorization: Bearer <jwt>   (owner only)
```

Synchronously pushes the agent's current canonical JSON (via `toCanonical()`) to the configured repo/branch/path using the GitHub Contents API, creating the file if it doesn't exist or updating it (using its current blob `sha`) if it does. Returns the shaped status on success or a `502` with an error message on failure. If `auto_sync` is enabled on the config, the same push also happens automatically as a background job every time the agent is saved (`PUT /api/agents/:id`) — this path never blocks or fails the save itself.

### Check sync status

```
GET /api/agents/:id/github-sync-status
Authorization: Bearer <jwt>   (owner only)
```

Response (or `null` if no sync config exists yet):

```json
{
  "state": "ok",
  "repo": "acme/agents-repo",
  "path": "agents/my-agent.json",
  "fileUrl": "https://github.com/acme/agents-repo/blob/main/agents/my-agent.json",
  "syncedAt": "2026-07-11T10:00:00Z",
  "errorMessage": null
}
```

`state` is one of `pending` (never synced yet), `ok`, `error`, or `conflict` (see Bidirectional Sync below).

**Why JSON, not the repo's Markdown export:** the git-tracked source-of-truth file is always the canonical JSON envelope, regardless of the `format` column's `markdown`/`json`/`both` setting (that setting only controls whether a human-readable `.md` companion is also written). AgentForge's Markdown parser (`parseMarkdown()`) cannot recover `skills`/`instructions` IDs from a Markdown file, so round-tripping through Markdown would silently lose data — JSON round-trips losslessly via `parseJson()`.

Implementation: [backend/src/githubSync.js](../backend/src/githubSync.js), [backend/src/integrations/github.js](../backend/src/integrations/github.js) (`getFileContents`/`putFileContents`).

Schema: [backend/db/init/20_agent_github_sync.sql](../backend/db/init/20_agent_github_sync.sql) (base config table), [backend/db/init/21_agent_github_sync_status.sql](../backend/db/init/21_agent_github_sync_status.sql) (sync status columns — see [Migration Overview](migration-overview.md) for applying to an existing deployment).

---

## Bidirectional Sync (GitHub → AgentForge)

When a human edits the tracked JSON file directly on GitHub (or merges a PR that changes it), AgentForge reconciles that change back into the agent automatically — no PR is opened by AgentForge itself; it only reacts to `push` events on the tracked branch (which is what fires once a PR merges).

### How the webhook gets created

The first time a sync config is saved for a repo (`PUT /api/agents/:id/github-sync-config`), AgentForge automatically registers a push-event webhook on that repo via the GitHub API, pointed at:

```
POST {APP_BASE_URL}/api/integrations/github/webhook
```

This requires the **`APP_BASE_URL`** environment variable to be set to a publicly reachable URL (e.g. a deployed domain, or an `ngrok`/`smee.io` tunnel in local dev — GitHub's servers cannot reach `localhost` directly). If `APP_BASE_URL` is unset, webhook registration is skipped entirely and sync stays one-way (push only); the config save still succeeds. Registration is idempotent — saving sync config for a second agent pointed at the same repo reuses the existing webhook rather than creating a duplicate. A per-repo secret is generated on first registration, encrypted, and stored in `github_repo_webhooks`; it's used to verify the `X-Hub-Signature-256` HMAC on every inbound delivery.

### What happens on an incoming push

1. GitHub POSTs the push payload to the webhook route. The signature is verified before anything else runs; an invalid or missing signature gets a `401` and nothing is processed.
2. For each file changed in the push, AgentForge checks whether it matches a configured agent's rendered path (`path_template` with `{slug}` resolved). Only matching files enqueue work — the webhook handler itself just acks fast (`200`) and does no GitHub API calls or DB writes beyond the match check.
3. A background `github_reconcile` job does the actual work: fetches the file at the pushed commit, parses it, and compares it against the agent's current state.

### Loop prevention

Every push AgentForge itself makes (Phase 1's `github_sync` job) records the resulting commit sha on `agent_github_sync.last_synced_commit_sha`. If an incoming webhook's commit sha matches that value, it's recognized as AgentForge's own echo and skipped — this is what stops a sync loop.

### Conflict handling

If the agent was also edited in AgentForge since the last clean sync (tracked via `last_synced_version_no`) **and** the incoming GitHub content differs, this is a conflict: AgentForge does **not** overwrite either side. Instead it inserts the incoming content as a new `agent_versions` row (`change_summary: 'GitHub conflict — review required'`) and sets `last_sync_status: 'conflict'`. Resolution is manual, via the existing version-history diff UI (`VersionHistoryPanel.jsx`) — there is no automatic merge.

If there's no local divergence, the incoming change applies cleanly: the `agents` row is updated and a new version is recorded with `change_summary: 'Synced from GitHub commit <sha> by <pusher>'`, attributed to the AgentForge user whose connected GitHub login matches the pusher, if any.

Implementation: [backend/src/githubReconcile.js](../backend/src/githubReconcile.js) (reconciliation job), [backend/src/integrations/github.js](../backend/src/integrations/github.js) (`ensureRepoWebhook`, `verifyWebhookSignature`).

Schema: [backend/db/init/22_github_repo_webhooks.sql](../backend/db/init/22_github_repo_webhooks.sql) (per-repo webhook registration), [backend/db/init/23_agent_github_sync_conflict_status.sql](../backend/db/init/23_agent_github_sync_conflict_status.sql) (adds `conflict` to the sync-status check constraint).

---

## Database Table

```sql
CREATE TABLE IF NOT EXISTS github_connections (
  user_id                UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  github_login           TEXT        NOT NULL,
  access_token_encrypted BYTEA       NOT NULL,
  scopes                 TEXT,
  connected_at           TIMESTAMPTZ DEFAULT NOW()
);
```

Migration: [backend/db/init/19_github_connections.sql](../backend/db/init/19_github_connections.sql)

---

## Security Properties

| Property | Implementation |
|---|---|
| Token encrypted at rest | AES-256-GCM, key from env |
| Token never leaves server | Not returned by any endpoint |
| CSRF protection | One-time random state token, 10-minute TTL |
| Minimum scope | `repo` (or `public_repo` for public-only) |
| Disconnect revokes token | Calls GitHub revocation API before DELETE |
| Key never in code or DB | Lives only in `GITHUB_TOKEN_ENCRYPTION_KEY` env var |

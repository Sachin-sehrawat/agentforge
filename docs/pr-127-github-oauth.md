## Summary

Server-side GitHub OAuth 2.0 connect flow with AES-256-GCM encrypted token storage. The GitHub access token is exchanged and stored entirely server-side — it never appears in any API response, browser storage, or log line.
  
### Changes

**`backend/db/init/19_github_connections.sql`**
New table for GitHub connections. `access_token_encrypted` is `BYTEA` — the plaintext token is never written to the database.

```sql
CREATE TABLE IF NOT EXISTS github_connections (
  user_id                UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  github_login           TEXT        NOT NULL,
  access_token_encrypted BYTEA       NOT NULL,
  scopes                 TEXT,
  connected_at           TIMESTAMPTZ DEFAULT NOW()
);
```

**`backend/src/integrations/github.js`** *(new)*
- `encryptToken` / `decryptToken` — AES-256-GCM, fresh 12-byte random IV per write, stored as `iv (12B) | authTag (16B) | ciphertext`. Auth tag provides tamper detection on read.
- `exchangeCodeForToken` — server-to-server POST to GitHub's token endpoint; code is never forwarded to the client.
- `fetchGitHubUser` — retrieves the `login` for the connecting account.
- `revokeGitHubToken` — calls GitHub's DELETE token revocation API on disconnect.

**`backend/src/app.js`**
Four new routes:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/integrations/github/connect` | `requireAuth` | Returns GitHub authorize URL with one-time CSRF state token |
| `GET` | `/integrations/github/callback` | none (browser redirect) | Verifies state, exchanges code, encrypts + upserts token, redirects to frontend |
| `GET` | `/api/integrations/github/status` | `requireAuth` | Returns `{ connected, githubLogin }` only — never the token |
| `DELETE` | `/api/integrations/github` | `requireAuth` | Revokes token at GitHub, then deletes row |

CSRF state is held in a server-side in-memory `Map` with 10-minute TTL and single-use semantics (deleted on first successful use).

**`backend/.env.example`**
Documents three new required env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEY`, and optional `FRONTEND_URL`.

**`frontend/src/components/GitHubConnectPanel.jsx`** *(new)*
UI panel showing connection status (connected badge + GitHub login, or "Not connected"), Connect and Disconnect buttons. Reads `?github=connected/error` query params injected by the OAuth callback redirect and cleans them from the URL without a reload.

**`frontend/src/api.js`**
Three new methods: `getGitHubStatus`, `startGitHubConnect`, `disconnectGitHub`.

**`docs/github-integration.md`** *(new)*
Covers: OAuth App registration steps, env vars, scope rationale (`repo` vs `public_repo`), the binary storage format, key rotation procedure, and all four API endpoints.

---

## Security properties

| Property | How |
|----------|-----|
| Token encrypted at rest | AES-256-GCM; key from `GITHUB_TOKEN_ENCRYPTION_KEY` env var only |
| Token never leaves the server | Not returned by any endpoint; not logged |
| CSRF protection | Random 48-hex-char state, 10-min TTL, single-use |
| Scope | `repo` (narrowest scope that allows file commits; documented in `docs/`) |
| Disconnect revokes token | Calls `DELETE /applications/{client_id}/token` before row deletion |
| Key never in code or DB | Lives exclusively in the environment |

---

## Test plan

- [ ] Register a GitHub OAuth App with callback URL `http://localhost:4000/integrations/github/callback`
- [ ] Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEY` in `backend/.env`
- [ ] Run the DB migration: `19_github_connections.sql`
- [ ] Click **Connect GitHub** in the UI → verify browser redirects to GitHub authorize page
- [ ] Authorize → verify redirect back to frontend with `?github=connected`
- [ ] Call `GET /api/integrations/github/status` → confirm `{ connected: true, githubLogin: "..." }` with no token field
- [ ] Inspect `github_connections` table directly → confirm `access_token_encrypted` is binary (no plaintext visible)
- [ ] Click **Disconnect** → confirm `204` response and status reverts to `{ connected: false }`
- [ ] Verify the revoked token no longer works against the GitHub API
- [ ] Test expired/replayed state: manually send a stale `state` to the callback → confirm redirect to error page

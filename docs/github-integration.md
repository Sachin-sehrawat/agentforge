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

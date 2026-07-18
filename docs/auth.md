# Authentication — Token Lifecycle & Secret Handling

## Token strategy

AgentForge uses **stateless JWT-based auth** with a single access token type. There is no refresh token in the current implementation — users re-authenticate on page reload (see [frontend-auth.md](frontend-auth.md) for the in-memory token rationale).

| Token | TTL | Purpose |
|---|---|---|
| Access token | 15 minutes | Carried on every API request (`Authorization: Bearer <token>`) |

### Payload

The access token carries only three fields:

```json
{ "userId": "<uuid>", "iat": 1718000000, "exp": 1718000900 }
```

No roles, emails, or other user attributes are encoded in the token. Callers that need user details must look them up from the database using `userId`. The `req.user.userId` field is used throughout route handlers (not `req.user.id`).

## Module API

### `backend/src/middleware/auth.js`

```js
requireAuth(req, res, next)  // 401 on missing/invalid token; attaches req.user on success
optionalAuth(req, res, next) // attaches req.user if token present & valid, else continues anonymous
```

`req.user` is the decoded JWT payload `{ userId, iat, exp }`.

Use `requireAuth` on routes that must be authenticated. Use `optionalAuth` on public routes that need to know whether the caller is logged in (e.g. the `isSubscribed` flag on public agents).

### `backend/src/auth/crypto.js`

```js
hashPassword(plaintext, cost = 12)  → Promise<string>
verifyPassword(plaintext, hash)      → Promise<boolean>
```

`cost` defaults to `12` (≈250 ms on modern hardware). Set lower (minimum `4`) only in tests.

### `backend/src/auth/token.js`

```js
signAccessToken(userId)   → string   // JWT valid for 15 min
verifyToken(token)        → payload  // throws on invalid/expired
```

`verifyToken` throws a `JsonWebTokenError` for tampered tokens and a `TokenExpiredError` for expired ones — both are from the `jsonwebtoken` package.

## Secret handling

`JWT_SECRET` must be a cryptographically random string of at least 32 bytes (64 hex chars recommended).

**Generate one:**
```sh
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Where to set it

| Environment | File |
|---|---|
| Local dev (bare Node) | `backend/.env` (gitignored) |
| Local dev (Docker Compose) | `.env.local` (gitignored) |
| CI / staging / production | Injected as an environment variable — never committed |

The `docker-compose.yml` backend service uses `${JWT_SECRET:?JWT_SECRET must be set}` — Docker Compose will refuse to start if the variable is absent, preventing accidental runs without auth.

### Rotation

1. Generate a new secret.
2. Set the new secret alongside the old one temporarily (e.g. a `JWT_SECRETS` list) so in-flight tokens remain valid during the rollover.
3. After all old tokens have expired (15-minute access token TTL), remove the old secret.

## Logout approach

### Stateless logout (current implementation)

Because JWTs are self-contained and verified without a database lookup, the simplest logout is **client-side discard**: the client clears the in-memory access token. No server-side action is required.

- **Pros:** zero server state, works across all replicas with no coordination.
- **Cons:** a stolen access token remains valid until its 15-minute TTL expires. This window is intentionally short to limit exposure.

### Server-side blacklist (optional, for immediate revocation)

For stricter revocation (e.g. "log out everywhere", compromised tokens), add a lightweight blacklist:

1. On logout, store the token's `jti` (JWT ID) or `(userId, iat)` pair in Redis with a TTL matching the token's remaining lifetime.
2. In `requireAuth`/`optionalAuth`, after `verifyToken` succeeds, check the blacklist. If the entry exists, reject with 401.

Tradeoffs: adds a Redis round-trip per authenticated request and requires a `jti` claim in the token payload (add to `signAccessToken`/`signRefreshToken`). Implement only when immediate revocation is a hard requirement.

### Current recommendation

Use stateless client discard. The 15-minute access token TTL keeps the revocation window small. Implement the blacklist only when compliance or security requirements demand it.

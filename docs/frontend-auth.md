# Frontend Authentication

## Token storage decision: in-memory only

The JWT access token is stored in a plain module-level variable in `api.js` — **no `localStorage`, `sessionStorage`, or cookies** on the client side.

### Why in-memory

| | In-memory (current) | `localStorage` | HttpOnly cookie |
|---|---|---|---|
| Survives page reload | No — re-auth required | Yes | Yes |
| Readable by XSS | No | **Yes** | No |
| Sent automatically by browser | No — explicit header | No | Yes (all same-origin requests) |
| CSRF risk | None | None | Needs `SameSite` + CSRF token |

In-memory is chosen because:
- The project has a `no-localStorage` rule to avoid storing sensitive data in a JS-readable surface.
- The 15-minute access token TTL (see `docs/auth.md`) keeps the re-auth friction low enough.
- An XSS attack that steals a `localStorage` token can exfiltrate it to an attacker server and continue using it after the session ends; an in-memory token dies with the tab.

### Accepted tradeoff

Users are logged out on every page reload. This is intentional. If persistence is required in the future, the correct path is server-set **HttpOnly + Secure + SameSite=Strict cookies** — not `localStorage`. That would require:

1. `/api/auth/login` and `/api/auth/signup` to set a `Set-Cookie` header (access token in cookie, or shift to refresh-token-only cookie flow).
2. The frontend to stop sending `Authorization: Bearer` and rely on the browser attaching the cookie automatically.
3. CSRF protection (the `SameSite=Strict` attribute handles modern browsers; add a CSRF token header for defense-in-depth).

## 401 global handling

`request()` in `api.js` intercepts every 401 response:

1. Clears `_token` to `null`.
2. Calls the `onUnauthorized` handler **only if a token was present at call time** — this prevents the handler from firing when the login form returns 401 for wrong credentials (no token exists yet in that case, so it's not a session-expiry event).

`AuthContext` registers its `clearAuth` function as the `onUnauthorized` handler on mount. `clearAuth` calls `setToken(null)` and `setUser(null)`, which causes any component reading `isAuthenticated` to re-render and redirect to the login flow.

## AuthContext API

Wrap the authenticated subtree with `<AuthProvider>` and consume via `useAuth()`.

```jsx
import { AuthProvider, useAuth } from './AuthContext.jsx';

// In your root:
<AuthProvider>
  <App />
</AuthProvider>

// In any component:
const { user, isAuthenticated, login, signup, logout } = useAuth();
```

| Value | Type | Description |
|---|---|---|
| `user` | `object \| null` | Deserialized user from the server; `null` when not authenticated |
| `isAuthenticated` | `boolean` | `true` when `user !== null` |
| `login(email, password)` | `async fn → user` | POST /api/auth/login; stores token; updates `user` |
| `signup(email, password, display_name)` | `async fn → user` | POST /api/auth/signup; stores token; updates `user` |
| `logout()` | `fn` | Clears token and user immediately — no server round-trip (stateless logout, see `docs/auth.md`) |

Both `login` and `signup` throw on error (wrong credentials, validation failures, network errors) — callers should catch and display the error to the user.

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

## Login / signup UI

### Components

**`AuthModal`** (`src/components/AuthModal.jsx`) — a modal dialog with two tabs: Sign in and Sign up.

- **Login fields:** Email, Password
- **Signup fields:** Display name, Email, Password (≥ 8 chars)
- Client-side validation runs before the API call; errors are shown inline below the fields with `role="alert"`.
- API errors (wrong credentials, duplicate email, etc.) surface the `{ error }` string from the response.
- The submit button shows "Signing in…" / "Creating account…" and all inputs are disabled while the request is in flight.
- Clicking the backdrop or the ✕ / Cancel buttons closes the modal without auth.

**`Topbar`** — right-hand auth section (always visible):

| State | Shown |
|---|---|
| Unauthenticated | Sign in (subtle) + Sign up (primary) buttons |
| Authenticated | Display name or email + Sign out button |

### Auth flow

```
User clicks "Save agent" (unauthenticated)
  → App.onSave() detects !isAuthenticated
  → cancels any pending autosave debounce timer
  → immediately calls api.saveWorkspaceData + api.saveDraftAgent (draft stash)
  → opens AuthModal with tab='login' and onSuccess=performSave
  → user fills form and submits
  → AuthContext.login() calls POST /api/auth/login, sets token + user
  → onSuccess() fires → performSave() runs with the now-valid token
  → AuthModal closes
  → user is back on the builder view, save completed
```

For direct Sign in / Sign up clicks from Topbar the flow is the same but `onSuccess` is `null` (no pending action).

### Draft preservation

When an unauthenticated user clicks Save, the agent state is preserved at two layers:

| Layer | Mechanism | Survives page reload? |
|---|---|---|
| In-memory | React `agent` state in `App.jsx` | No — but the auth modal is an overlay, not a navigation, so the state is never lost during normal auth flow |
| Server draft | `api.saveWorkspaceData` + `api.saveDraftAgent` | Yes — written immediately on the Save click, before the modal opens |

The server write happens synchronously (fire-and-forget) in `onSave` before calling `setAuthModal`. Any debounced autosave timer is cancelled first so there's no double-write race.

After the user logs in, `performSave` runs with the same in-memory `agent` state — no restore step is needed because the modal is an overlay and the state was never discarded.

### Originating view preservation

The auth modal is a layered overlay, not a view change — `view` state in `App.jsx` never changes while the modal is open. After auth, the user is exactly where they left off.

### Navigation convention

The app has no router. Views are a string state (`'builder' | 'agents' | 'skills'`) managed in `App.jsx` and rendered by `Topbar.jsx`. Auth follows the same pattern — auth state comes from `AuthContext`, modal visibility is a piece of state in `App`.

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

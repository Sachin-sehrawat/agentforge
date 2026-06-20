param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$REPO    = "Sachin-sehrawat/agentforge"
$API     = "https://api.github.com"
$Headers = @{
    Authorization          = "Bearer $Token"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

function Invoke-GH($Method, $Path, $Body) {
    $params = @{ Method = $Method; Uri = "$API$Path"; Headers = $Headers }
    if ($Body) {
        $params.Body        = ($Body | ConvertTo-Json -Depth 10)
        $params.ContentType = "application/json"
    }
    Invoke-RestMethod @params
}

# ---------------------------------------------------------------------------
# 1. Milestone
# ---------------------------------------------------------------------------
Write-Host "Creating milestone..."
$milestone = Invoke-GH POST "/repos/$REPO/milestones" @{
    title       = "User Authentication & Personalized Agents"
    description = "Login/signup, JWT auth, user-scoped agents, public vs private visibility, subscriptions, and the My Agents tab."
    due_on      = "2026-08-31T07:00:00Z"
}
$milestoneNumber = $milestone.number
Write-Host "  Created milestone #$milestoneNumber"

# ---------------------------------------------------------------------------
# 2. Labels
# ---------------------------------------------------------------------------
Write-Host "Ensuring labels exist..."
$labelDefs = @(
    @{ name="backend";  color="0075ca"; description="Backend / Express / API" }
    @{ name="frontend"; color="e4e669"; description="Frontend / React" }
    @{ name="auth";     color="d93f0b"; description="Authentication & authorisation" }
    @{ name="database"; color="1d76db"; description="Schema or migration changes" }
    @{ name="infra";    color="5319e7"; description="Infrastructure, CI/CD, Docker" }
    @{ name="p1";       color="b60205"; description="Priority 1 — blocks other work" }
    @{ name="p2";       color="e99695"; description="Priority 2 — normal priority" }
)
$existing = (Invoke-GH GET "/repos/$REPO/labels?per_page=100") | Select-Object -ExpandProperty name
foreach ($l in $labelDefs) {
    if ($existing -notcontains $l.name) {
        Invoke-GH POST "/repos/$REPO/labels" $l | Out-Null
        Write-Host "  Created label: $($l.name)"
    } else {
        Write-Host "  Exists:        $($l.name)"
    }
}

# ---------------------------------------------------------------------------
# 3. Issues
# ---------------------------------------------------------------------------

$issues = @()

# ── Issue 1 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Backend] Database migration: create users table"
  labels = @("backend","database","auth","p1")
  body   = @'
## Description

Create the PostgreSQL migration that adds the `users` table. This is the foundational schema change that all authentication features depend on — nothing else in this milestone can land until this is in place.

## Acceptance Criteria

- [ ] Migration file `backend/src/migrations/003_add_users.sql` created
- [ ] `users` table columns: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `email TEXT UNIQUE NOT NULL`, `password_hash TEXT NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
- [ ] Unique index on `email` for fast login lookups
- [ ] Migration is idempotent — uses `CREATE TABLE IF NOT EXISTS`
- [ ] Migration tested manually against local PostgreSQL (`docker-compose up -d`)
- [ ] `schema_migrations` tracking table referenced in migration runner (see infrastructure issue)
- [ ] `docs/runbook.md` schema section updated with the `users` table definition and column descriptions
- [ ] No data loss to existing `agents` or `custom_skills` rows

## Related Tasks

- Migration runner (`migrate.js`) must exist before this runs automatically
- `JWT_SECRET` env var needed before auth endpoints can be tested
- Auth utilities issue depends on this table existing

## Labels

`backend`, `database`, `auth`, `p1`
'@
}

# ── Issue 2 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Backend] Auth utilities: bcrypt password hashing + JWT sign/verify helpers"
  labels = @("backend","auth","p1")
  body   = @'
## Description

Add the shared auth utilities that both the register/login endpoints and the `requireAuth` middleware will import. Keeping these in one helper module makes them independently testable and easy to swap out later (e.g., `jsonwebtoken` → `jose`).

## Acceptance Criteria

- [ ] `bcryptjs` and `jsonwebtoken` added to `backend/package.json` dependencies (not `devDependencies`)
- [ ] `backend/src/auth.js` created and exports:
  - `hashPassword(plaintext)` → async bcrypt hash (salt rounds: 12)
  - `verifyPassword(plaintext, hash)` → async boolean
  - `signToken(userId)` → JWT signed with `process.env.JWT_SECRET`, expires in `process.env.JWT_EXPIRES_IN` (default `'7d'`)
  - `verifyToken(token)` → returns decoded payload or throws a typed error
- [ ] Server throws with a descriptive message on startup if `JWT_SECRET` is missing or an empty string
- [ ] `JWT_SECRET` and `JWT_EXPIRES_IN` added to `.env.local.example` with placeholder values
- [ ] Unit tests for all four helpers:
  - `hashPassword` + `verifyPassword` round-trip succeeds
  - Wrong plaintext returns `false`
  - `signToken` + `verifyToken` round-trip returns correct `userId`
  - Tampered token throws
  - Expired token throws

## Related Tasks

- Auth endpoints (register/login) import `hashPassword`, `verifyPassword`, `signToken`
- `requireAuth` middleware imports `verifyToken`
- Infrastructure issue adds `JWT_SECRET` to CI environment

## Labels

`backend`, `auth`, `p1`
'@
}

# ── Issue 3 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Backend] Auth endpoints: POST /api/auth/register and POST /api/auth/login"
  labels = @("backend","auth","p1")
  body   = @'
## Description

Implement the two public-facing auth endpoints that let users create accounts and obtain a JWT. These endpoints are the entry point for the entire authentication flow.

## Acceptance Criteria

- [ ] `POST /api/auth/register`:
  - Validates email format with a regex or lightweight validator
  - Validates password length ≥ 8 characters
  - Returns `400` with a descriptive `{ error }` for missing or invalid fields
  - Returns `409` if the email address is already registered
  - Hashes password with `hashPassword()` before inserting into `users`
  - Returns `201 { token, user: { id, email, createdAt } }` on success
- [ ] `POST /api/auth/login`:
  - Looks up user by email; returns `401` for unknown email (no 404 — avoids email enumeration)
  - Returns `401` for wrong password
  - Returns `200 { token, user: { id, email } }` on success
- [ ] Email is trimmed and lowercased before any DB query in both endpoints
- [ ] Raw passwords are never logged or echoed back in any response
- [ ] Existing `rateLimit` middleware applied to both routes
- [ ] Integration tests:
  - Register success → `201` with token
  - Duplicate email → `409`
  - Weak password (< 8 chars) → `400`
  - Missing email → `400`
  - Login success → `200` with token
  - Login wrong password → `401`
  - Login unknown email → `401`
- [ ] No console errors when running the test suite

## Related Tasks

- Depends on users table migration
- Depends on auth utilities (`hashPassword`, `signToken`)
- `requireAuth` middleware (next issue) enables `GET /api/auth/me`

## Labels

`backend`, `auth`, `p1`
'@
}

# ── Issue 4 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Backend] requireAuth middleware + GET /api/auth/me endpoint"
  labels = @("backend","auth","p1")
  body   = @'
## Description

Add the JWT-verifying middleware that every protected route will use, and the `/me` endpoint the frontend calls on load to rehydrate a stored session without requiring the user to log in again.

## Acceptance Criteria

- [ ] `requireAuth(req, res, next)` exported from `backend/src/auth.js`:
  - Reads the `Authorization: Bearer <token>` header
  - Returns `401 { error: 'Unauthorized' }` if the header is missing or not in Bearer format
  - Returns `401 { error: 'Unauthorized' }` if the token is expired or has an invalid signature (do not reveal the specific reason)
  - On a valid token: attaches `req.user = { id, email }` and calls `next()`
- [ ] `GET /api/auth/me` added to `app.js`, protected by `requireAuth`:
  - Queries `users` by `req.user.id`
  - Returns `200 { id, email, createdAt }` if found
  - Returns `404 { error: 'User not found' }` if the user was deleted since the token was issued
- [ ] Middleware unit tests:
  - Missing `Authorization` header → `401`
  - Header present but not `Bearer` format → `401`
  - Valid token → `req.user` populated, `next()` called
  - Expired token → `401`
  - Token with tampered payload → `401`
- [ ] Integration tests for `GET /api/auth/me`:
  - Valid token → `200` with user object
  - No token → `401`
  - Valid token but user deleted → `404`

## Related Tasks

- All agent route ownership changes import `requireAuth`
- Frontend `AuthContext` calls `/api/auth/me` on load

## Labels

`backend`, `auth`, `p1`
'@
}

# ── Issue 5 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Backend] Database migration: add user_id and is_public to agents table"
  labels = @("backend","database","auth","p1")
  body   = @'
## Description

Migrate the `agents` table to support user ownership and public/private visibility. Existing rows must remain valid — `user_id` is nullable and `is_public` defaults to `FALSE` so nothing breaks before the ownership routes land.

## Acceptance Criteria

- [ ] Migration file `backend/src/migrations/004_agent_user_scope.sql` created
- [ ] `ALTER TABLE agents ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL` (nullable)
- [ ] `ALTER TABLE agents ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE`
- [ ] Index on `(user_id)` to speed up "my agents" queries
- [ ] Index on `(is_public)` to speed up the public feed query
- [ ] `serializeAgent()` in `app.js` updated to include `isPublic` and `userId` in the returned object
- [ ] `validateAgentInput()` updated to accept an optional `isPublic: boolean` field (defaults to `false` when omitted)
- [ ] Migration idempotent — uses `ADD COLUMN IF NOT EXISTS` or equivalent guard
- [ ] Existing rows verified to still return from `GET /api/agents` after migration
- [ ] `docs/runbook.md` schema section updated with new columns and their purpose

## Related Tasks

- Depends on users table migration
- Agent route ownership issue depends on this
- Subscriptions migration (`005_`) depends on `agents.id` remaining unchanged

## Labels

`backend`, `database`, `auth`, `p1`
'@
}

# ── Issue 6 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Backend] Agent routes: enforce ownership + public/private scoping"
  labels = @("backend","auth","p1")
  body   = @'
## Description

Update all agent CRUD routes to enforce JWT auth and ownership rules. Public agents are readable by anyone; private agents only by their owner. Mutations always require a valid token.

## Acceptance Criteria

- [ ] `GET /api/agents` — no auth required; returns only rows where `is_public = TRUE`, ordered by `updated_at DESC`
- [ ] `GET /api/agents/mine` — new route; requires `requireAuth`; returns all agents where `user_id = req.user.id`; returns `[]` (not `401`) when the user has no agents
- [ ] `GET /api/agents/:id` — no auth if `is_public = TRUE`; requires auth if private; returns `403` if private and requester is not the owner
- [ ] `POST /api/agents` — requires `requireAuth`; sets `user_id = req.user.id` on insert; persists `is_public` from validated request body
- [ ] `PUT /api/agents/:id` — requires `requireAuth`; returns `403` if `user_id != req.user.id`
- [ ] `DELETE /api/agents/:id` — requires `requireAuth`; returns `403` if `user_id != req.user.id`
- [ ] `api.js` on the frontend: `listMyAgents: () => request('/agents/mine')` added
- [ ] Integration tests:
  - `GET /api/agents` without token → `200` with only public agents
  - `GET /api/agents/mine` without token → `401`
  - `GET /api/agents/mine` with valid token → `200` with owner's agents only
  - `POST /api/agents` without token → `401`
  - `POST /api/agents` with token → `201` with `userId` set
  - `PUT /api/agents/:id` with different user's token → `403`
  - `DELETE /api/agents/:id` with different user's token → `403`
- [ ] No regressions on existing agent tests

## Related Tasks

- Depends on `requireAuth` middleware
- Depends on agents table migration (`user_id`, `is_public` columns)
- AgentsPage tab split (frontend) consumes `GET /api/agents/mine`

## Labels

`backend`, `auth`, `p1`
'@
}

# ── Issue 7 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Backend] Agent subscriptions: table migration + subscribe/unsubscribe endpoints"
  labels = @("backend","auth","database","p1")
  body   = @'
## Description

Let authenticated users subscribe to public agents. Subscriptions are persisted in a join table and surfaced in `GET /api/agents/mine` alongside owned agents, tagged with a `source` field so the frontend can display the correct badge and actions.

## Acceptance Criteria

- [ ] Migration file `backend/src/migrations/005_agent_subscriptions.sql` created:
  - Table: `agent_subscriptions (user_id UUID, agent_id UUID, subscribed_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, agent_id))`
  - FK `user_id REFERENCES users(id) ON DELETE CASCADE`
  - FK `agent_id REFERENCES agents(id) ON DELETE CASCADE`
- [ ] `POST /api/agents/:id/subscribe` — requires `requireAuth`:
  - Returns `404` if the agent does not exist
  - Returns `403` if the agent is not public (`is_public = FALSE`)
  - Inserts subscription with `INSERT ... ON CONFLICT DO NOTHING` (idempotent)
  - Returns `201` on first subscription, `200` on duplicate
- [ ] `DELETE /api/agents/:id/subscribe` — requires `requireAuth`:
  - Returns `404` if no subscription exists for this user/agent pair
  - Returns `204` on successful removal
- [ ] `GET /api/agents/mine` updated:
  - UNIONs owned agents (`user_id = me`) with subscribed agents (via join on `agent_subscriptions`)
  - Each agent in the response includes a `source` field: `'owned'` or `'subscribed'`
  - Ordered by `updated_at DESC` across both sets
- [ ] Integration tests:
  - Subscribe to a public agent → `201`
  - Subscribe again → `200` (no error)
  - Subscribe to a private agent → `403`
  - Subscribe to non-existent agent → `404`
  - Unsubscribe → `204`
  - Second unsubscribe → `404`
  - `GET /api/agents/mine` returns subscribed agent with `source: 'subscribed'`
  - Deleting an agent cascades and removes its subscriptions
- [ ] `docs/runbook.md` schema section updated with `agent_subscriptions` table

## Related Tasks

- Depends on agents table migration
- Frontend subscribe UI depends on these endpoints
- `GET /api/agents/mine` change affects My Agents tab

## Labels

`backend`, `auth`, `database`, `p1`
'@
}

# ── Issue 8 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Frontend] AuthContext: session management + api.js Bearer header"
  labels = @("frontend","auth","p1")
  body   = @'
## Description

Add a React context that owns the current user session. The token lives in `localStorage` and is rehydrated on every app load via `GET /api/auth/me`. All `api.js` requests automatically attach the Bearer header when a token is present.

## Acceptance Criteria

- [ ] `frontend/src/auth/AuthContext.jsx` created; exports `AuthProvider` and `useAuth()`
- [ ] `AuthProvider` state shape: `{ user: { id, email } | null, loading: boolean }`
- [ ] On mount: reads `token` from `localStorage`, calls `GET /api/auth/me` to rehydrate; sets `loading: false` on resolution whether or not the token is valid
- [ ] `login(email, password)`: calls `POST /api/auth/login`, stores token in `localStorage`, updates `user` state
- [ ] `signup(email, password)`: calls `POST /api/auth/register`, stores token, updates `user` state
- [ ] `logout()`: removes `token` from `localStorage`, sets `user` to `null`
- [ ] `useAuth()` throws a descriptive error when called outside `AuthProvider`
- [ ] `AuthProvider` wraps the entire app in `frontend/src/main.jsx`
- [ ] `frontend/src/api.js` `request()` updated:
  - Reads `localStorage.getItem('token')` on each call
  - Adds `Authorization: Bearer <token>` header when a token is present
  - Does not suppress 401 errors — callers handle them
- [ ] `WORKSPACE_ID` and `USER_ID` constants in `App.jsx` remain as `'default'` for now (will be replaced with real user ID in a follow-up)
- [ ] Unit tests:
  - `login()` sets `user` and stores token in `localStorage`
  - `logout()` clears `user` and removes token
  - Mount with stored token rehydrates session via `/api/auth/me`
  - Mount with invalid token sets `user = null` (no crash or uncaught rejection)
- [ ] No console errors on fresh app load with no stored token

## Related Tasks

- LoginPage and SignupPage will call `login()` and `signup()`
- Save button intercept uses `useAuth()` to check login state
- Topbar user menu reads `user` from this context

## Labels

`frontend`, `auth`, `p1`
'@
}

# ── Issue 9 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Frontend] LoginPage + SignupPage components"
  labels = @("frontend","auth","p1")
  body   = @'
## Description

Build the two auth form pages. They use the same light-theme styling (white panel, `#6366f1` indigo accent, `#f0f4ff` background) as the rest of the app and are accessible as views within the existing view-state routing.

## Acceptance Criteria

- [ ] `frontend/src/components/LoginPage.jsx` created:
  - Email and password fields with associated `<label>` elements
  - "Log in" submit button — disabled and shows "Logging in…" while the request is in flight
  - Inline error message below the form on `401` → "Invalid email or password"
  - Generic server error message on `500` / network failure
  - "Don't have an account? Sign up" link that calls `onSetView('signup')`
  - On success: calls `onSetView('builder')` (or fulfils pending save action if `pendingAction === 'save'`)
- [ ] `frontend/src/components/SignupPage.jsx` created:
  - Email, password, and confirm-password fields with labels
  - Client-side validation: passwords must match before any API call is made
  - "Create account" submit button — disabled while loading
  - Inline error for: mismatched passwords, `409` → "Email already taken", weak password → shows server message
  - "Already have an account? Log in" link that calls `onSetView('login')`
  - On success: calls `onSetView('builder')`
- [ ] `App.jsx` `handleSetView` extended to accept `'login'` and `'signup'`; renders the correct page in place of the builder/agents/skills views
- [ ] Canvas state is NOT reset when navigating to login or signup and back
- [ ] Styling matches existing components — no new colour tokens or CSS files
- [ ] All form fields have proper `id` + `htmlFor` bindings for accessibility
- [ ] Unit tests:
  - `LoginPage`: valid submit calls `login()`, `401` shows error message, button disabled during load
  - `SignupPage`: password mismatch shows error before API call, `409` shows "Email already taken", success navigates to builder

## Related Tasks

- Depends on `AuthContext` (`login()` and `signup()` functions)
- Topbar login/signup buttons navigate to these views
- Save button redirect lands on `LoginPage`

## Labels

`frontend`, `auth`, `p1`
'@
}

# ── Issue 10 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Frontend] Topbar auth UI: logged-out links + logged-in user avatar dropdown"
  labels = @("frontend","auth","p1")
  body   = @'
## Description

Surface auth state in the top navigation bar so users always know whether they are logged in. Logged-out users see login/signup buttons; logged-in users see an initials avatar that opens a dropdown with their email and a log-out action.

## Acceptance Criteria

- [ ] `Topbar.jsx` imports `useAuth()`
- [ ] **Logged-out state** (right side of topbar, replacing any empty space):
  - "Log in" text/ghost button → calls `onSetView('login')`
  - "Sign up" filled-indigo button → calls `onSetView('signup')`
- [ ] **Logged-in state** (same right-side slot):
  - Circle chip with the user's first initial (uppercase), indigo background, white text
  - Clicking the chip toggles a small dropdown below it
  - Dropdown contents: full `user.email` (truncated with ellipsis at 24 chars, `title` attribute shows full), a `<hr>` divider, "Log out" button
  - Clicking "Log out" calls `logout()` from `useAuth()` then calls `onSetView('builder')`
- [ ] Dropdown closes on: "Log out" clicked, outside click (`mousedown` listener on `document`), Escape key
- [ ] Outside-click `useEffect` listener is cleaned up on component unmount
- [ ] No layout shift when toggling between logged-out and logged-in states — reserve a fixed-width right-side slot
- [ ] Styling consistent with existing topbar — no new colour tokens
- [ ] Unit tests:
  - Renders "Log in" and "Sign up" when `user` is `null`
  - Renders avatar with correct initial when `user` is set
  - Clicking "Log out" calls `logout()` and `onSetView('builder')`
  - Dropdown closes on outside click (simulate `mousedown` on `document`)
  - Dropdown closes on Escape key

## Related Tasks

- Depends on `AuthContext`
- LoginPage and SignupPage must be registered views before this is merged
- `onSetView` prop must accept `'login'` and `'signup'`

## Labels

`frontend`, `auth`, `p1`
'@
}

# ── Issue 11 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Frontend] Save button auth gate + pendingAction flow; standalone Download button"
  labels = @("frontend","auth","p1")
  body   = @'
## Description

Non-logged-in users can build freely and download their agent spec at any time, but clicking "Save Agent" redirects them to the login page. After logging in, the save resumes automatically. The current auto-download-on-save behaviour is moved to a dedicated "Download MD" button.

## Acceptance Criteria

- [ ] `App.jsx` imports `useAuth()`
- [ ] `onSave()` updated:
  - If `!user`: stores `pendingAction: 'save'` in component state, calls `onSetView('login')` — does NOT call the backend API
  - If logged in: saves to backend via `api.createAgent` / `api.updateAgent` as before, does NOT trigger `downloadMd()` automatically
- [ ] `LoginPage.jsx` receives an `onLoginSuccess` callback prop:
  - After successful login, checks `pendingAction === 'save'` and calls `onSave()` if so
  - `pendingAction` cleared to `null` after handling
- [ ] `Topbar.jsx` gains a "Download MD" button adjacent to "Save Agent":
  - Always visible regardless of auth state
  - Calls `onDownload(agent)` which triggers Markdown download as before
  - Visually distinct from Save — e.g., outlined/ghost style with a download icon, while Save remains filled
- [ ] "Save Agent" label and position unchanged; only behaviour changes
- [ ] Unit tests:
  - `onSave` when not logged in → sets `view` to `'login'`, does NOT call `api.createAgent`
  - `onSave` when logged in → calls `api.createAgent`, does NOT call `downloadMd`
  - Download button always calls `downloadMd` regardless of auth state
  - Login with `pendingAction === 'save'` → `onSave` is called after login
- [ ] No console errors on unauthenticated save attempt

## Related Tasks

- Depends on `AuthContext`
- Depends on LoginPage component (for `onLoginSuccess` callback)
- Topbar Download button is a visible UX change — update user guide

## Labels

`frontend`, `auth`, `p1`
'@
}

# ── Issue 12 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Frontend] AgentsPage: Public Agents tab + My Agents tab"
  labels = @("frontend","auth","p2")
  body   = @'
## Description

Split the Agents page into two tabs. "Public Agents" is accessible to everyone and shows all `is_public` agents. "My Agents" requires login and shows the user's own agents plus subscribed agents, each with a badge indicating ownership vs subscription.

## Acceptance Criteria

- [ ] `AgentsPage.jsx` renders a tab bar with two tabs: **Public Agents** | **My Agents**
- [ ] Active tab stored in local component state; defaults to "Public Agents"
- [ ] **Public Agents tab**:
  - Fetches `GET /api/agents` on mount and on tab switch to this tab
  - Visible to logged-in and logged-out users
  - Search field filters by agent name and persona within this tab only
  - Agent cards show: Open, Download actions (no Delete — user is not the owner)
- [ ] **My Agents tab**:
  - If `user` is `null`: renders inline message "Log in to see your saved agents" with a "Log in" button that calls `onSetView('login')` — no full-page redirect
  - If logged in: fetches `GET /api/agents/mine` on mount and on tab switch to this tab
  - Owned agents tagged with an "Owned" badge (indigo); subscribed agents tagged with "Subscribed" badge (purple)
  - Owned agent cards show: Open, Download, Delete actions
  - Subscribed agent cards show: Open, Download, Unsubscribe action (no Delete)
  - Search field filters by name and persona within this tab only
- [ ] `api.js` `listMyAgents: () => request('/agents/mine')` added
- [ ] Loading spinner or skeleton shown while each tab's fetch is in progress
- [ ] Error state displayed if the API call fails (with a retry button)
- [ ] Tab bar styled consistently with existing page headers (indigo underline for active tab)
- [ ] Unit tests:
  - Public tab renders and calls `listAgents` without a token
  - My Agents tab shows login prompt when `user` is `null`
  - My Agents tab calls `listMyAgents` when `user` is set
  - Owned badge rendered for `source: 'owned'`; Subscribed badge for `source: 'subscribed'`
  - Delete shown only on owned cards; Unsubscribe shown only on subscribed cards
  - Search filters correctly per tab

## Related Tasks

- Depends on `GET /api/agents/mine` backend endpoint
- Subscribe UI (next issue) sits inside the Public Agents tab
- Agent cards need a new `source` prop to conditionally render badges

## Labels

`frontend`, `auth`, `p2`
'@
}

# ── Issue 13 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Frontend] Subscribe/Unsubscribe to public agents"
  labels = @("frontend","auth","p2")
  body   = @'
## Description

Let logged-in users subscribe to any public agent from the Public Agents tab with a single click. Subscribed agents immediately appear in the My Agents tab. Uses optimistic UI so the toggle feels instant.

## Acceptance Criteria

- [ ] Subscribe button on each agent card in the **Public Agents tab**:
  - When `user` is `null`: button hidden (or rendered as greyed-out chip with `title="Log in to subscribe"`)
  - When logged in and not subscribed: "Subscribe" button (outlined style)
  - When logged in and already subscribed: "Subscribed ✓" button (filled/active style)
  - When the agent is owned by the current user: Subscribe button hidden entirely
- [ ] Clicking "Subscribe":
  - Optimistically adds the agent ID to the subscribed set in component state
  - Calls `POST /api/agents/:id/subscribe`
  - On error: reverts the optimistic update and shows a brief inline error
- [ ] Clicking "Subscribed ✓":
  - Optimistically removes from subscribed set
  - Calls `DELETE /api/agents/:id/subscribe`
  - On error: reverts optimistic update and shows inline error
- [ ] After a successful subscribe/unsubscribe, the My Agents list is re-fetched in the background so it stays in sync
- [ ] Subscribed agent IDs initialised from `listMyAgents()` response on `AgentsPage` mount
- [ ] `api.js` additions:
  - `subscribeAgent: (id) => request('/agents/' + id + '/subscribe', { method: 'POST' })`
  - `unsubscribeAgent: (id) => request('/agents/' + id + '/subscribe', { method: 'DELETE' })`
- [ ] Unit tests:
  - Subscribe button hidden when `user` is null
  - Clicking Subscribe toggles state to "Subscribed ✓" and calls `subscribeAgent`
  - Clicking "Subscribed ✓" toggles back and calls `unsubscribeAgent`
  - API error reverts optimistic update
  - Own agent does not render Subscribe button
  - Subscribed agent appears in My Agents list after subscribing

## Related Tasks

- Depends on AgentsPage tab split
- Depends on subscribe/unsubscribe backend endpoints
- My Agents tab re-fetch is handled by calling the shared fetch function from the parent

## Labels

`frontend`, `auth`, `p2`
'@
}

# ── Issue 14 ────────────────────────────────────────────────────────────────
$issues += @{
  title  = "[Infrastructure] Migration runner, auth deps, and CI environment updates"
  labels = @("infra","backend","database","p1")
  body   = @'
## Description

Wire together all the infrastructure plumbing so auth works end-to-end in development and CI: a migration runner that applies SQL files in order on server startup, npm package installs, new environment variables, and CI pipeline secrets.

## Acceptance Criteria

- [ ] `bcryptjs` and `jsonwebtoken` present in `backend/package.json` `dependencies` (not `devDependencies`)
- [ ] `backend/src/migrations/` directory exists with a brief `README.md` explaining the `NNN_description.sql` naming convention
- [ ] `backend/src/migrate.js` created:
  - Creates `schema_migrations (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW())` if it doesn't exist
  - Reads all `*.sql` files from the `migrations/` directory, sorted ascending by filename
  - Skips any file whose name is already recorded in `schema_migrations`
  - Runs each pending migration inside a transaction; rolls back the transaction and rethrows on error
  - Logs `[migrate] Applied: <filename>` for each new migration and `[migrate] Up to date.` when nothing is pending
- [ ] `backend/src/server.js` calls `runMigrations()` before `app.listen()` and before the PostgreSQL health check log
- [ ] Running the server twice with no schema changes produces no errors and logs "Up to date."
- [ ] All three migration files (`003_add_users.sql`, `004_agent_user_scope.sql`, `005_agent_subscriptions.sql`) are present and applied by the runner
- [ ] `.env.local.example` updated:
  - `JWT_SECRET=change-me-in-production`
  - `JWT_EXPIRES_IN=7d`
- [ ] `.github/workflows/` CI job updated:
  - `JWT_SECRET: test-secret` added to the relevant job's `env` block
  - Postgres service in CI has the migrations applied before tests run (server startup handles this automatically)
- [ ] `docker-compose.yml` unchanged — no new containers; migrations run at app startup
- [ ] Unit tests for `migrate.js`:
  - Idempotent: second run with same files logs "Up to date." and does not re-apply
  - Failed migration SQL rolls back the transaction; `schema_migrations` does not record the failed entry
- [ ] `docs/runbook.md` "Database" section updated:
  - How to add a new migration file
  - List of current migrations and what each does
  - `JWT_SECRET` entry in the environment variables reference table

## Related Tasks

- Must be merged or ready before any backend auth issue can be tested in CI
- All three DB migration files depend on this runner
- `.env.local.example` changes affect every developer setup

## Labels

`infra`, `backend`, `database`, `p1`
'@
}

# ---------------------------------------------------------------------------
# 4. Create all issues
# ---------------------------------------------------------------------------
Write-Host "`nCreating issues..."
foreach ($issue in $issues) {
    $payload = @{
        title     = $issue.title
        body      = $issue.body
        labels    = $issue.labels
        milestone = $milestoneNumber
    }
    $created = Invoke-GH POST "/repos/$REPO/issues" $payload
    Write-Host "  #$($created.number): $($created.title)"
    Start-Sleep -Milliseconds 400   # respect GitHub secondary rate limit
}

Write-Host "`nDone! View milestone at: https://github.com/$REPO/milestone/$milestoneNumber"

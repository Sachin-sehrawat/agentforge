# AgentForge — Design Reference

## Project Overview

AgentForge is a visual drag-and-drop builder for AI agents. Users design agent workflows on a canvas (name, persona, system prompt, tools, skills), save them, and export as provider-agnostic Markdown specs. The app defines *what* an agent should do; execution happens elsewhere.

**Stack:** React + Vite (port 5173) · Express + SQLite/MongoDB backend (port 4000)

---

## Business Value

- **Visual, no-code design** — non-engineers can compose and document AI agents without writing code
- **Provider-agnostic** — exported Markdown specs are not tied to any specific AI provider; works with any runtime
- **Reusable knowledge** — skills, personas, and templates are shared across agents and exposed in a marketplace
- **Community flywheel** — publish agents publicly, browse community creations, fork and remix what you love
- **Audit-ready documentation** — every agent has a machine-readable spec that doubles as human-readable documentation

---

## Key Features

| Feature | Description |
|---|---|
| **Visual Canvas Builder** | Drag-and-drop canvas to assemble agent nodes, tool nodes, and wire connections between them |
| **Marketplace** | Publish agents publicly, browse community creations, fork and subscribe to agents |
| **Skills System** | Attach reusable typed skills to any agent — cite sources, show reasoning, concise mode, etc. |
| **Persona Library** | Curated and custom personas that shape agent tone, style, and expertise |
| **Template Gallery** | Production-ready starting points: Researcher, Code Assistant, Customer Service, Data Analyst, and more |
| **Markdown Export** | One-click download of an agent as a portable `.md` spec file |
| **Version History** | Track and restore previous versions of any agent |
| **Agent Analytics** | View subscriber counts, ratings, and activity timeline per agent |
| **Admin Panel** | Authenticated CRUD management of builtin skills and persona categories (stored in MongoDB) |
| **Bulk Operations** | Select multiple agents for batch export or delete |
| **Webhook Settings** | Configure webhook callbacks per agent |
| **Import / Validate** | Import agent specs and validate structure with schema validation |
| **Keyboard Shortcuts** | Full shortcut overlay for power-user workflows |
| **Dark / Light Mode** | Toggle between themes; system preference respected |
| **Reduced Motion** | Animations suppressed when `prefers-reduced-motion` is set |

### Template Agents (built-in)

- **Researcher** — web search, cite sources, show step-by-step reasoning
- **Customer Service** — HTTP request lookups, formal/concise communication style
- **Code Assistant** — code runner tool, step-by-step reasoning before output
- **Data Analyst** — calculator + code runner for data transformation and statistics
- **Blank** — empty starting point for custom configurations

---

## Typography

| Role | Font | Weight | Usage |
|---|---|---|---|
| Display / Headings | `Space Grotesk` | 600–700 | Brand name, page titles, node titles, card headings, nav items |
| Body / UI | `Inter` | 400–600 | Paragraphs, labels, buttons, form inputs |
| Mono / Code | `JetBrains Mono` | 400 | Timestamps, tool chips, stat badges, code areas, quota counters |

**CSS variables:**
```
--font-display: 'Space Grotesk', sans-serif
--font-body:    'Inter', sans-serif
--font-mono:    'JetBrains Mono', monospace
```

---

## Color Scheme

### Light Theme (default)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#f0f4ff` | App / canvas background |
| `--bg-grid-line` | `rgba(99,102,241,0.07)` | Canvas grid lines |
| `--panel` | `#ffffff` | Cards, sidebar, topbar, modals |
| `--panel-alt` | `#f6f7ff` | Secondary surfaces, input backgrounds |
| `--border` | `#dde1f0` | Standard borders |
| `--border-soft` | `#eaedf8` | Subtle dividers |
| `--text` | `#1a1d35` | Primary text |
| `--text-muted` | `#6b7280` | Secondary text, labels |
| `--text-dim` | `#9ca3af` | Placeholder, timestamps |

### Dark Theme (`data-theme="dark"`)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0f1117` | App / canvas background |
| `--bg-grid-line` | `rgba(99,102,241,0.09)` | Canvas grid lines |
| `--panel` | `#1a1d2e` | Cards, sidebar, topbar, modals |
| `--panel-alt` | `#1e2235` | Secondary surfaces |
| `--border` | `#2e3348` | Standard borders |
| `--border-soft` | `#252840` | Subtle dividers |
| `--text` | `#e8ecf4` | Primary text |
| `--text-muted` | `#9ba3bf` | Secondary text |
| `--text-dim` | `#8590b0` | Placeholder, timestamps |

---

## Accent Colors

| Token | Hex | Role |
|---|---|---|
| `--accent` / `--accent-cyan` | `#6366f1` | Primary brand color — indigo/violet; buttons, focus rings, active states |
| `--accent-hover` | `#4f52e0` (light) / `#7c7ff5` (dark) | Button hover state |
| `--accent-violet` | `#8b5cf6` | Download actions, brand gradient endpoint, secondary accents |
| `--accent-amber` | `#f59e0b` | Warnings, skills icon accent |
| `--accent-coral` | `#f97316` | Tertiary accent, some tool categories |
| `--danger` | `#ef4444` | Delete, error states, destructive actions |

**Brand gradient:** `linear-gradient(135deg, #6366f1, #8b5cf6)` — used on the logo mark.

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius` | `12px` | Cards, nodes, modals, dropdowns |
| `--radius-sm` | `8px` | Buttons, inputs, chips, small containers |

---

## Semantic Colors

### Diff / Version History

| State | Text | Background | Border |
|---|---|---|---|
| Add | `#166534` (light) / `#4ade80` (dark) | `rgba(34,197,94,0.10)` | `rgba(34,197,94,0.30)` |
| Remove | `#b91c1c` (light) / `#f87171` (dark) | `rgba(239,68,68,0.08)` | `rgba(239,68,68,0.20)` |

### Toast / Notifications

| Type | Background | Border | Text |
|---|---|---|---|
| Info | `#ffffff` / `#1a1d2e` | — | — |
| Warning | `#fffbeb` / `#2d1d00` | `#fcd34d` / `#92400e` | `#92400e` / `#fde68a` |
| Error | `#fef2f2` / `#300a0a` | `#fca5a5` / `#7f1d1d` | `#991b1b` / `#fca5a5` |
| Success | `#f0fdf4` / `#0a2318` | `#86efac` / `#14532d` | `#166534` / `#86efac` |

---

## Layout Structure

```
┌─────────────────── Topbar (panel bg, 1px border-bottom) ───────────────────┐
│  [Logo]  [Agent Name Input]  [Nav: Builder / Agents / Skills / Marketplace] │
│                              [Saved Agents ▾]  [Export MD]  [🌙]  [Auth]   │
├─────────────────── SkillsBar (42px, skill chips) ──────────────────────────┤
│                                                                              │
│  ┌─ Sidebar ──┐  ┌─────────── Canvas ─────────────┐  ┌─ Persona Panel ──┐  │
│  │ 230px      │  │  bg grid, draggable nodes,      │  │ 260px            │  │
│  │ Tool cards │  │  wires SVG overlay              │  │ Persona library  │  │
│  │ by category│  │                                 │  │ by category      │  │
│  └────────────┘  └─────────────────────────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Sidebar hidden at `< 980px`; stacks vertically
- Persona panel hidden at `< 1100px`
- Canvas scrolls horizontally and vertically (1100 × 720 base, expands to fill)

---

## Component Conventions

- **Buttons** have three main variants: default (outline), `.primary` (indigo fill), `.danger` (red fill), `.subtle` (transparent), `.download` (alt surface with violet hover)
- **Chips / badges** use `color-mix(in srgb, <color> 10%, transparent)` for tinted backgrounds matching each item's category color
- **Nodes** on canvas are 220px wide (tool nodes) / 280px wide (agent node); always white panel, `--radius` corners, subtle indigo shadow
- **Focus rings** are always `0 0 0 3px rgba(99,102,241,0.10)` for consistency across inputs and buttons
- **Easing** for landing page animations: `cubic-bezier(0.16, 1, 0.3, 1)` (expo out — stored as `--ease-landing`)

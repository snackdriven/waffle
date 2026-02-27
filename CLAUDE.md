# CLAUDE.md

## Project Overview

**mise-en-place** is a zero-dependency task/event planner built with vanilla HTML, CSS, and JavaScript. Split across three files (`index.html`, `styles.css`, `app.js`) with no build step. Two object types: **Events** (date+time, location, notes) and **Tasks** (three time states, statuses, labels, subtasks, dependencies).

Live at: https://snackdriven.github.io/mise-en-place/

## Repository Structure

```
mise-en-place/
├── .github/workflows/deploy-pages.yml   # GitHub Pages auto-deploy on push to main
├── index.html                           # HTML markup only (~45 lines)
├── styles.css                           # All CSS (~650 lines)
├── app.js                               # All application logic (~1550 lines)
├── README.md                            # Project readme
└── CLAUDE.md                            # This file
```

## Running Locally

```sh
open index.html          # Open directly in browser
npx serve .              # Local dev server
```

No install step required. No build step exists.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which deploys the repo to GitHub Pages via `actions/deploy-pages@v4`. The workflow uploads the entire directory as an artifact.

## Architecture

### Three-File Structure

- **`index.html`** — Semantic HTML markup. Contains `<link>` to styles.css and `<script>` to app.js. No inline CSS or JS.
- **`styles.css`** — All CSS with `@layer` cascade control.
- **`app.js`** — All application logic: data model, persistence, views, rendering, CRUD, undo.

### Data Model

**Event:**
```javascript
{
  id: string,            // crypto.randomUUID()
  type: 'event',
  title: string,         // Max 500 chars
  allDay: boolean,       // true = date-only event, false = timed event
  dateTime: string,      // YYYY-MM-DD (all-day) or YYYY-MM-DDTHH:MM (timed)
  location: string,      // Max 500 chars
  notes: string,         // Max 2000 chars
  createdAt: number,     // Date.now() timestamp
}
```

**Task:**
```javascript
{
  id: string,
  type: 'task',
  title: string,
  timeState: 'due-by' | 'open' | 'recurring',
  status: 'active' | 'waiting' | 'done',   // no 'blocked' — derived from dependencies
  dueDate: string | null,                   // YYYY-MM-DD (required when recurring)
  activationDate: string | null,            // when it surfaces. Auto-set for due-by.
  recurrenceRule: 'daily' | 'weekly' | 'monthly' | null,
  subtasks: [{ id, text, done }],
  dependsOn: [],                            // task IDs
  linkedEvent: string | null,               // event ID
  labels: [],                               // from ['15min', 'browse'] only
  createdAt: number,
  updatedAt: number,                        // for stale calculation
}
```

### Key Design Decisions

- **Three status values only** (`active`, `waiting`, `done`). Blocked is derived from `dependsOn` via `isBlocked()`.
- **Labels fixed to `['15min', 'browse']`**. Execution hints only, no custom labels.
- **`ACTIVE_WINDOW_DAYS = 10`** — due-by tasks surface 10 days before their due date.
- **`STALE_DAYS = 14`** — open active tasks not updated in 14+ days get a stale badge.
- **`PURGE_DAYS = 90`** — done items older than 90 days auto-purge on save.
- **Views are overlapping filter slices**, not partitions. Items can appear in multiple views.
- **Recurring dueDate = next occurrence date**. Completing creates next instance atomically in one mutation.
- **Undo is keyboard-only** (Ctrl+Z / Cmd+Z). No mobile undo button in v1.

### Views

| View | Filter | Sort |
|------|--------|------|
| Calendar | Items on `selectedDate` (events by dateTime + tasks by dueDate) | events first by dateTime, tasks by createdAt |
| Active | Due-by tasks, active/waiting, in window (activation ≤ today, due today → +10d) | dueDate asc |
| Active: Overdue | Due-by tasks, active/waiting, dueDate < today | dueDate asc |
| Browse | Tasks, active/waiting, open OR has 15min/browse label | 15min first, then dueDate, then createdAt |
| Recurring | Recurring tasks, dueDate ≤ today, not done | dueDate asc, then title |
| Done | All done items (capped at 50) — read-only with Reopen | updatedAt desc |
| All | Everything — read-only with search | createdAt desc |

### CSS Architecture

CSS uses `@layer` for cascade control:
```
@layer reset, tokens, base, components, a11y;
```

- **reset** — Universal box-sizing reset
- **tokens** — Catppuccin Mocha color variables (`--ctp-*`), font stacks, spacing scale
- **base** — Document-level body/font styling
- **components** — All component styles (view nav, cards, forms, week strip, badges, dialogs, toasts)
- **a11y** — `prefers-reduced-motion` and `prefers-contrast: more` overrides

CSS conventions:
- **CSS custom properties** use `--ctp-` prefix for Catppuccin palette
- **CSS nesting** throughout
- **Logical properties** (`inline-size`, `block-size`) instead of physical
- **`clamp()`** for fluid typography — no breakpoints
- **`color-mix(in oklch)`** for interaction states
- **Mobile-first** — designed for 375px, desktop gets more padding via `max-inline-size: 32rem`

### JavaScript Architecture

Global scope with module-like organization.

**Constants:**
```
STORAGE_KEY = 'tc-items'        BACKUP_KEY = 'tc-items-backup'
SCHEMA_VERSION = 1              LABELS = ['15min', 'browse']
STATUSES = ['active', 'waiting', 'done']
TIME_STATES = ['due-by', 'open', 'recurring']
RECURRENCE_RULES = ['daily', 'weekly', 'monthly']
ACTIVE_WINDOW_DAYS = 10         STALE_DAYS = 14
DAY_MS = 86400000               MAX_UNDO = 20
PURGE_DAYS = 90                 DATE_RE = /^\d{4}-\d{2}-\d{2}$/
```

**State variables:**
- `items` — Array of Event and Task objects
- `currentView` — `'calendar'` | `'active'` | `'browse'` | `'recurring'` | `'done'` | `'all'`
- `selectedDate` — YYYY-MM-DD for calendar day selection
- `weekStart` — YYYY-MM-DD for week strip
- `editingId` / `createFormType` / `pendingDeleteId` / `searchQuery` — UI state
- `undoStack` — Array of `{ label, snapshot }` entries (in-memory only)

**Function groups:**

| Group | Key Functions | Purpose |
|-------|-----------|---------|
| Date utils | `todayStr()`, `addDays()`, `getWeekStart()`, `computeNextDue()`, `formatCountdown()` | Date arithmetic and display |
| DOM helper | `el()` | Create DOM nodes safely (textContent for user data) |
| Pure utils | `isBlocked()`, `canComplete()`, `isStale()`, `isRecurringTask()` | Derived state, never mutate |
| Status | `transitionStatus()` | Single gatekeeper for all status changes |
| Validation | `validateItem()` | Type-aware validation/normalization on load |
| Persistence | `loadItems()`, `saveItems()`, `migrateFromV0()` | localStorage with versioned envelope + double-write backup |
| Filters | `allPreds()`, `anyPred()`, atomic predicates | Composable filter system |
| Views | `getViewItems()`, `sortForView()` | View-specific filtering and sorting |
| Mutation | `mutate(label, fn)`, `undo()` | Centralized state change with undo snapshots |
| CRUD | `createEvent()`, `createTask()`, `toggleItem()`, `completeRecurringInstance()`, `requestDelete()`, `confirmDelete()`, `saveTaskEdit()`, `saveEventEdit()`, `reopenItem()` | All data operations |
| Rendering | `render()`, `renderViewNav()`, `renderCreateToggle()`, `renderCreateForm()`, `renderWeekStrip()`, `renderItemCard()`, `renderTaskCard()`, `renderEventCard()`, `renderTaskEditForm()`, `renderEventEditForm()`, `renderSearchBar()`, `renderEmptyState()` | DOM generation |

**Mutation pattern:**
```javascript
mutate(label, fn)   // fn mutates items in place, returns true if changed
```
`mutate()` snapshots before, runs fn, commits only if fn returns truthy. Every CRUD function uses this. No other function calls `saveItems()` or `render()` directly (except `undo()`).

**Status transitions:**
```javascript
transitionStatus(task, nextStatus)  // returns false if invalid
```
All status changes go through `transitionStatus()`. No direct `task.status = ...` outside migration.

## Testing

No test framework. Manual browser testing at 412x915 (mobile) and 1920x1080 (desktop).

## Key Conventions

- **Zero dependencies** — No npm packages, no CDN libraries (only Google Fonts)
- **Three files** — HTML in `index.html`, CSS in `styles.css`, JS in `app.js`
- **No build tooling** — No bundler, transpiler, linter, or formatter
- **Catppuccin Mocha theme** — Dark mode only, 26-color palette
- **Mobile-first** — 44px minimum touch targets, `env(safe-area-inset-bottom)` support
- **Accessibility** — ARIA labels on all badges, `role="tablist"` nav, `role="status"` toasts, focus management on edit forms, keyboard shortcuts
- **Security** — DOM nodes via `el()` helper + `textContent` for all user data. `innerHTML` only for static SVG icons. No `${userText}` in template literals assigned to innerHTML. `escapeAttr()` kept for data-attribute IDs only.
- **Modern web platform** — CSS `@layer`, nesting, `color-mix()`, logical properties, `crypto.randomUUID()`, native `<dialog>`, `text-wrap: balance`

## Making Changes

When modifying this project:

1. **HTML** goes in `index.html`, **CSS** in `styles.css`, **JS** in `app.js`
2. Respect `@layer` ordering (component styles in `@layer components`)
3. Use Catppuccin Mocha tokens (`--ctp-*`) for colors
4. Use logical properties (`inline-size`, `block-start`, etc.)
5. Use `el()` helper + `textContent` for user-provided text — never `innerHTML` with user data
6. Use `mutate(label, fn)` for all state changes — fn returns true/false
7. Use `transitionStatus()` for all status changes — no direct `task.status = ...`
8. Maintain 44px minimum touch targets
9. Keep zero-dependency philosophy
10. Test at 412x915 (mobile) and 1920x1080 (desktop)

## Constraints & Tradeoffs

- Recurring instances don't inherit dependencies — each starts clean
- Undo is keyboard-only (Ctrl+Z) — no mobile undo button in v1
- All view is read-only with title-only search
- Done view: reopen forbidden for recurring tasks (would create duplicates)
- Reopen due-by task sets activationDate = today (surfaces immediately)
- Scale budget: designed for ~5k total items. Auto-purge keeps done items to ~90 days.
- `activationDate` auto-clamps: if > dueDate, set to dueDate. If missing on due-by, computed from dueDate - 10d.

### v1.1 Roadmap

- Mobile undo button (highest priority)
- "Every N days" recurrence
- Full dependency UI with drag-to-link
- Quick status-flip (swipe/long-press for waiting)
- Richer archive tools (full-text search, manual purge)

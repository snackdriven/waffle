# CLAUDE.md

## Project Overview

**tender-circuit** is a zero-dependency, single-file todo application built with vanilla HTML, CSS, and JavaScript. The entire app lives in `index.html` (≈1,400 lines). There is no build step, no `package.json`, and no `node_modules`.

Live at: https://snackdriven.github.io/tender-circuit/

## Repository Structure

```
tender-circuit/
├── .github/workflows/deploy-pages.yml   # GitHub Pages auto-deploy on push to main
├── index.html                           # The entire application (HTML + CSS + JS)
├── README.md                            # Project readme
└── CLAUDE.md                            # This file
```

## Running Locally

```sh
open index.html          # Open directly in browser
npx serve .              # Local dev server with hot reload
```

No install step required. No build step exists.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which deploys the repo to GitHub Pages via `actions/deploy-pages@v4`. The workflow uploads the entire directory as an artifact — no build or transformation occurs.

## Architecture

### Single-File Structure (`index.html`)

The file is organized into three sections:

| Section | Lines | Contents |
|---------|-------|----------|
| HTML head + CSS | 1–837 | Meta tags, Google Fonts (Inter, DM Mono), all styles |
| HTML body | 838–903 | Semantic markup, dialog element, toast container |
| JavaScript | 904–1405 | All application logic in a single `<script>` block |

### CSS Architecture

CSS uses `@layer` for cascade control with five layers declared in order:

```
@layer reset, tokens, base, components, a11y;
```

- **reset** — Universal box-sizing reset
- **tokens** — Design tokens: 26 Catppuccin Mocha color variables (`--ctp-*`), font stacks, spacing scale, border radii
- **base** — Document-level body/font styling
- **components** — All component styles (app shell, inputs, buttons, filters, todos, dialogs, toasts)
- **a11y** — `prefers-reduced-motion` and `prefers-contrast: more` overrides

CSS conventions:
- **CSS custom properties** use `--ctp-` prefix for Catppuccin palette colors
- **CSS nesting** is used throughout (no flat selectors)
- **Logical properties** (`inline-size`, `block-size`) instead of `width`/`height`
- **`clamp()`** for fluid typography — no `@media` breakpoints for font sizes
- **`color-mix(in oklch)`** for hover/interaction color blending
- **IDs and classes** use kebab-case (`todo-input`, `category-badge`, `confirm-dialog`)

### JavaScript Architecture

Global scope with module-like organization. No framework or imports.

**Constants:**
- `STORAGE_KEY = 'catppuccin-todos'` — localStorage key
- `MAX_UNDO = 50` — Maximum undo history depth
- `CATEGORIES` — Object mapping 6 category keys (`general`, `work`, `personal`, `health`, `finance`, `learning`) to `{ label, color }` pairs

**State variables (module-level `let`):**
- `todos` — Array of todo objects
- `currentFilter` — `'all'` | `'active'` | `'completed'`
- `currentCategory` — `'all'` | category key
- `currentSort` — `'newest'` | `'oldest'` | `'alpha-az'` | `'alpha-za'` | `'category'` | `'due-date'`
- `editingId` / `lastAddedId` / `pendingDeleteId` — UI state tracking
- `undoStack` — Array of `{ label, snapshot }` entries

**Todo object shape:**
```javascript
{
  id: string,            // crypto.randomUUID()
  text: string,          // Max 500 chars
  completed: boolean,
  category: string,      // Key from CATEGORIES
  createdAt: number,     // Date.now() timestamp
  dueDate: string | null // ISO date string (YYYY-MM-DD) or null
}
```

**Function groups:**

| Group | Functions | Purpose |
|-------|-----------|---------|
| Persistence | `loadTodos()`, `save()` | localStorage read/write with validation |
| Undo | `pushUndo()`, `undo()` | Snapshot-based undo (JSON serialization) |
| Toast | `showToast()`, `dismissToast()` | Notification toasts with undo button |
| CRUD | `addTodo()`, `toggleTodo()`, `deleteTodo()`, `confirmDelete()`, `cancelDelete()`, `clearCompleted()` | Todo operations |
| Editing | `startEdit()`, `saveEdit()`, `cancelEdit()` | Inline editing |
| Filtering | `getFiltered()`, `getSorted()` | Filter and sort pipeline |
| Rendering | `render()`, `renderEditForm()` | DOM generation via `innerHTML` |
| Utilities | `escapeHtml()`, `escapeAttr()`, `categoryOptionsHtml()`, `formatCountdown()` | XSS prevention, template helpers |

**Event handling** uses delegation on parent elements (e.g., `list.addEventListener('click', ...)`) with `data-action` attributes for dispatching. Keyboard shortcuts: `Ctrl+Z`/`Cmd+Z` for undo, `Enter` to add/save, `Escape` to cancel edit.

## Testing

There is no test framework or test files. The app is tested manually in the browser.

## Key Conventions

- **Zero dependencies** — No npm packages, no CDN libraries (only Google Fonts)
- **Single file** — All HTML, CSS, and JS stay in `index.html`
- **No build tooling** — No bundler, transpiler, linter, or formatter configured
- **Catppuccin Mocha theme** — Dark mode only, using the 26-color Catppuccin Mocha palette
- **Mobile-first** — 44px minimum touch targets, `env(safe-area-inset-bottom)` support
- **Accessibility** — ARIA attributes (`aria-label`, `aria-selected`, `role="tab"`, `role="status"`), semantic HTML, reduced-motion support, high-contrast support
- **Security** — All user text is escaped via `escapeHtml()` / `escapeAttr()` before insertion into DOM
- **Modern web platform** — Uses 2026 browser features: CSS `@layer`, nesting, `color-mix()`, logical properties, `crypto.randomUUID()`, native `<dialog>`, `text-wrap: balance`

## Making Changes

When modifying this project:

1. All changes go in `index.html` — there is only one file
2. Respect the `@layer` ordering when adding CSS (put component styles in `@layer components`)
3. Use Catppuccin Mocha color tokens (`--ctp-*`) for any new colors
4. Use logical properties (`inline-size`, `block-start`, etc.) instead of physical ones
5. Escape all user-provided text with `escapeHtml()` or `escapeAttr()` before rendering
6. Use `pushUndo()` before any state mutation to preserve undo capability
7. Call `save()` after modifying `todos` to persist to localStorage
8. Call `render()` after state changes to update the DOM
9. Maintain the mobile-first approach with minimum 44px touch targets
10. Keep the zero-dependency philosophy — do not add external libraries

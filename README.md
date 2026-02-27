# mise-en-place

A task and event planner with zero dependencies and a whole lot of [Catppuccin Mocha](https://github.com/catppuccin/catppuccin).

**[Try it live](https://snackdriven.github.io/mise-en-place/)**

![Dark mode planner with Catppuccin Mocha colors](https://img.shields.io/badge/theme-catppuccin%20mocha-cba6f7?style=for-the-badge) ![No dependencies](https://img.shields.io/badge/dependencies-0-a6e3a1?style=for-the-badge)

## What's inside

Three files (`index.html`, `styles.css`, `app.js`). No build step. No node_modules. No nonsense. Just open it.

- Inter for the UI, DM Mono for the numbers
- Catppuccin Mocha's 26-color palette (dark mode only, no apologies)
- Mobile-first with 44px touch targets and safe-area support
- Persists to `localStorage` with a versioned envelope and a backup copy
- Optional cross-device sync via Supabase (magic link auth, no passwords)

### Tasks

Tasks have three time states. "Due by" tasks surface 10 days before their deadline and show a countdown. "Open" tasks have no deadline but get a stale badge after 14 days without an update. "Recurring" tasks complete and immediately create the next instance.

Status goes `active → waiting → done`. "Blocked" isn't a status — it's derived from unfinished dependencies. The only labels are `15min` and `browse`, both meant as execution hints, not categories.

Tasks support subtasks (expand/collapse on the card), dependencies, and an optional activation date that controls when a task first surfaces.

### Events

Events have a date (all-day or timed), an optional location, and notes. The calendar view shows events and tasks together on a weekly strip.

### Views

| View | What's in it |
|------|--------------|
| Calendar | Week strip + items on selected day. Agenda mode shows upcoming events grouped by date. |
| Active | Due-by tasks in a configurable window (10 days / 30 days / all). Overdue and due-today get their own sections. |
| Anytime | Open tasks plus anything labeled `browse` or `15min`. Sortable by label priority, A→Z, or newest. |
| Recurring | Recurring tasks due today or earlier |
| Done | Last 50 completed items (reopenable). Items auto-purge 90 days after completion. |
| All | Everything, with title search, type filter (tasks / events), and sort (newest / due date) |

### Other stuff

- Ctrl+Z / Cmd+Z undoes the last action, up to 20 levels
- `?` opens the GitHub repo
- Stale dependency references are cleaned up on load
- View transitions between tabs (Chrome/Edge)
- Sticky section headings with backdrop blur in Active view

## Sync

Sign in with a magic link to sync across devices. Your data lives in `localStorage` first — Supabase is the async remote copy. The app works fully offline; changes sync when you're back online (peach dot = pending, green = synced).

Sign-in is optional. Hit "Use without sync" on the login screen to skip it.

## Run locally

```sh
open index.html
```

Or with hot reload:

```sh
npx serve .
```

## License

MIT

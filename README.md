# nibble

A task and event planner. Three files. No build step. No node_modules.

**[Try it →](https://snackdriven.github.io/nibble/)**

---

It started as a fix for the thing where you open your task manager and immediately close it because it has too much going on. nibble has tasks and events. That's it.

The ADHD design is intentional. "Blocked" isn't a status you set manually — it's derived from unfinished dependencies, so the app figures out what you can actually do right now instead of showing you everything you can't touch yet. Activation dates let you hide tasks until they're relevant. The Active view only surfaces due-by tasks in the next 10 days, not your entire backlog forever.

## Tasks

Three time states: **due-by** (has a deadline, surfaces 10 days out with a countdown), **open** (no deadline, gets a stale badge after 14 days untouched), **recurring** (completes and immediately queues the next instance). Status goes `active → waiting → done`.

Tasks support subtasks, dependencies, and labels. The only labels are `15min` and `browse` — execution hints, not categories. An optional activation date controls when a task first surfaces.

## Events

Date with optional time, location, and notes. Show up on the calendar alongside tasks due that day.

## Views

| View | What it shows |
|------|---------------|
| Calendar | Week strip + items on the selected day. Agenda mode groups upcoming events by date. |
| Active | Due-by tasks in the next 10 days. Overdue and due-today get their own sections. |
| Anytime | Open tasks plus anything labeled `browse` or `15min`. Sortable. |
| Recurring | Recurring tasks due today or earlier |
| Done | Last 50 completed items (reopenable). Auto-purge after 90 days. |
| All | Everything, with title search, type filter, and sort |

## Other

- Ctrl+Z / Cmd+Z undoes the last action, up to 20 levels
- `?` opens this repo
- Dark mode only, no apologies
- Mobile-first, 44px touch targets, safe-area support
- View transitions on Chrome and Edge

## Sync

Sign in with a magic link to sync across devices. Data lives in `localStorage` — Supabase is the async remote copy. Peach dot = pending, green = synced. Works fully offline.

Sign-in is optional. "Use without sync" skips it entirely.

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

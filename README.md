# tender-circuit

A sleek, zero-dependency todo app wrapped in the cozy [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) palette.

**[Try it live](https://snackdriven.github.io/tender-circuit/)**

![Dark mode todo app with Catppuccin Mocha colors](https://img.shields.io/badge/theme-catppuccin%20mocha-cba6f7?style=for-the-badge) ![No dependencies](https://img.shields.io/badge/dependencies-0-a6e3a1?style=for-the-badge) ![Single file](https://img.shields.io/badge/files-1-89b4fa?style=for-the-badge)

## What's inside

One HTML file. No build step. No node_modules. Just open it.

- **Inter** for the UI, **DM Mono** for the numbers
- Catppuccin Mocha — 26 hand-picked colors so your eyes can relax
- Mobile-first with 44px touch targets and safe-area support
- Persists to `localStorage` so your todos survive a refresh
- Filter by All / Active / Done

## 2026 CSS & JS

This tiny app is quietly packed with modern web platform features:

| Feature | Why |
|---|---|
| `@layer` cascade | reset → tokens → base → components → a11y |
| CSS nesting | Flat selectors are so 2023 |
| `clamp()` fluid type | Responsive heading without a single `@media` |
| `color-mix(in oklch)` | Perceptually uniform hover blending |
| Logical properties | `inline-size` and `block-size` for writing-mode resilience |
| `text-wrap: balance` | No more lonely orphan words in headings |
| `font-optical-sizing` | Inter adjusts glyph shapes to the rendered size |
| `crypto.randomUUID()` | Real UUIDs, not `Date.now()` + dice rolls |
| `prefers-reduced-motion` | Respects your OS animation settings |
| `prefers-contrast: more` | Extra borders for high-contrast users |

## Run locally

```sh
open index.html
```

That's it. Or serve it if you want hot reload:

```sh
npx serve .
```

## License

MIT

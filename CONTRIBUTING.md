# Contributing to Courbe

Thanks for helping keep Arc's workflow alive. Every kind of contribution counts: code, design, bug reports, testing your own Arc import, docs, translations.

## Ground rules

- Be kind. We follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- One pull request = one change. Small PRs get reviewed fast.
- Discuss big changes in an issue first, so nobody loses a weekend on something that won't land.
- **Never attach your real `StorableSidebar.json`** to an issue: it contains your URLs. Share counts, structure, or a redacted excerpt.

## Setup

Requirements: Node 22+, npm. Courbe builds on macOS and Linux (Linux is used for CI and tests).

```bash
npm ci
npm run build       # typecheck + bundle main and renderer
npm test            # unit tests (Vitest)
npm run e2e         # end-to-end journey in Electron (Playwright; uses xvfb on Linux)
npm run dist:mac    # package the macOS app
```

Useful environment variables:

- `COURBE_USER_DATA` — use a throwaway profile directory.
- `COURBE_ARC_SIDEBAR` — import a specific Arc sidebar file.

## Where things live

| Path | What |
|---|---|
| `src/core/` | Pure logic, no Electron: data model, reducers, Arc import, routing, Command Bar ranking, themes. Fully unit-tested. |
| `src/main/` | Electron main process: windows, tab views, sessions, menus, features. |
| `src/preload/` | The small, typed bridge exposed to the UI. |
| `src/renderer/` | React UI: sidebar, overlays (Command Bar, panels), Little window. |
| `tests/core/` | Unit tests. `tests/e2e/` — one full user journey. |

## Pull request checklist

- [ ] `npm run build` and `npm test` pass; `npm run e2e` passes if you touched the UI or main process.
- [ ] New logic in `src/core` comes with a test.
- [ ] UI changes include a before/after screenshot.
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).

## Security model (please keep it)

Web content never gets Node.js: tab views run sandboxed with context isolation, and the UI talks to the main process only through typed IPC commands. If your change needs a new privilege, say so in the PR.

## License

By contributing, you agree that your contributions are licensed under the [MPL-2.0](LICENSE).

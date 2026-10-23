# Bowvane

**Arc is shutting down on December 22, 2026. Your sidebar doesn't have to.**

Bowvane is an open-source, Chromium-based browser for macOS that brings back the way Arc worked — Spaces, pinned tabs and folders, a self-cleaning Today, the Command Bar, Little Arc, Air Traffic Control — and imports your Arc sidebar in one click, themes and favicons included.

No account. No sync server. No AI you didn't ask for. Your data stays on your Mac.

> ⚠️ **Early alpha.** Bowvane is usable daily by its author, but expect rough edges. Read [Known limitations](#known-limitations) before switching.

![Bowvane screenshot](docs/screenshot.png)

## Why

Arc changed how a lot of us use the web, and now it's going away. The alternatives either ask you to start over or ship a different idea of what a browser is. Bowvane's promise is narrow: **keep Arc's workflow alive, in the open, so it can never be switched off again.**

## Features

| | |
|---|---|
| **Arc import** | Reads `StorableSidebar.json`: Spaces, pinned tabs, nested folders, Favorites, Space colors and light/dark themes, cached favicons. |
| **Spaces** | Name, emoji, color, appearance, and an optional separate profile (separate cookies and logins). `⌃1…9`, `⌥⌘←/→`, two-finger swipe. |
| **Pinned, Favorites, Today** | Nested folders, drag and drop, rename, *Back to pinned URL*. Today tabs auto-archive after 12 h (configurable). |
| **Command Bar** | `⌘T` / `⌘L`: open tabs, history, actions, URLs, search. |
| **Little Bowvane** | `⌥⌘N` — a small floating window for quick links, promotable to a full tab. |
| **Air Traffic Control** | Route links by domain or path to a Space or to Little Bowvane. |
| **Split View, Peek** | Side-by-side tabs (`⌃⇧=`), preview outbound links without leaving the page. |
| **Boosts & Zap** | Per-site CSS/JS, hide any element. |
| **Built-in ad blocking** | Ghostery's engine and filter lists. |
| **Little things** | Copy URL (`⇧⌘C`) or as Markdown (`⌥⇧⌘C`), capture (`⇧⌘2`), find (`⌘F`), auto Picture-in-Picture, per-tab mute, private window. |

## Install

Pre-built releases are coming with the first public version. Until then, build from source:

```bash
git clone https://github.com/bowvane/bowvane && cd bowvane
npm ci
npm run dist:mac        # → release/mac-arm64/Bowvane.app
```

The build is not notarized yet: after copying it to `/Applications`, run `xattr -cr /Applications/Bowvane.app` once.

On first launch, Bowvane imports your Arc sidebar if Arc's data is still on your Mac. You can re-import any time from **Settings**.

## Known limitations

- **macOS (Apple silicon) only** for now. Windows and Intel builds are wanted — see the roadmap.
- **Chrome extensions**: Electron supports only part of the extension APIs. Password managers in particular are not guaranteed yet.
- **Google sign-in** and passkeys have not been tested broadly.
- Not yet: Easels, Notes, Live Folders, sync.

## Roadmap

What Arc never had, in the order we think matters most:

1. **Client/project boundaries** — every Space can own its logins, downloads, notes and agent permissions, and Bowvane shows *which account you are actually signed into*.
2. **Full export and proven restore** — your organization must outlive any browser, including this one.
3. **A resume card per Space** — goal, next action, decisions with their sources.
4. **A local bridge for your own AI agents** (MCP), with permissions enforced by code, not by a prompt.
5. **Per-Space sleep** — keep pinned apps without keeping them all in RAM.

See [open issues](../../issues) and the `good first issue` label to get started.

## Contributing

Contributions are very welcome — code, design, testing on your own Arc export, translations. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Mozilla Public License 2.0](LICENSE). You can use Bowvane's code in any project; changes to Bowvane's own files must stay open.

---

Bowvane is an independent project. It is not affiliated with, endorsed by, or connected to The Browser Company. "Arc" is used only to describe compatibility.

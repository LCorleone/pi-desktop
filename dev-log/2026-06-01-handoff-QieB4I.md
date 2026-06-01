# Handoff — 2026-06-01

## Purpose
Continue development on the pi-desktop fork (`LCorleone/pi-desktop`, branch `july-dev`). Next session should pick from the prioritized plan below.

## What Was Done
- Investigated the full project architecture: Tauri v2 + Lit/TypeScript frontend, Rust backend, RPC bridge to `pi` CLI.
- Created branch `july-dev` and pushed to `git@github.com:LCorleone/pi-desktop.git` (remote name: `july`).
- Modified `.github/workflows/release.yml` to build Windows exe only (NSIS), manual trigger, draft release. Commit `1c1a17b` pushed.
- Analyzed all 18 open upstream issues on `gustavonline/pi-desktop` and produced a prioritized contribution plan.
- Verified TypeScript compiles clean (`npx tsc --noEmit`), frontend builds (`npm run build:frontend`), no TODO/FIXME markers in code.
- Tested exe on real Windows device — identified two blocking issues for Windows users.
- Staged package rename: `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent` in README.md, lib.rs, main.ts (not yet committed/pushed — git commit disabled by AGENTS.md).

## Current State
- **Branch**: `july-dev` on remote `july` (SSH: `git@github.com:LCorleone/pi-desktop.git`)
- **Original upstream**: `origin` → `https://github.com/gustavonline/pi-desktop.git`
- **Windows exe build**: ✅ Succeeded — `Pi Desktop_1.0.0_x64-setup.exe` uploaded as draft release. Required enabling "Read and write permissions" in repo Settings → Actions → Workflow permissions.
- **Windows testing done**: App launches but has two first-run blockers (see below).

## Windows First-Run Issues (tested on real device)

Two issues block a clean first-run on Windows. Both need fixes in `src-tauri/src/lib.rs`:

1. **`pi.cmd` not discovered by Rust** — npm installs `pi` as a `.cmd` wrapper (e.g. `C:\Users\<name>\AppData\Roaming\npm\pi.cmd`). Rust's `which::which("pi")` only finds `.exe`, not `.cmd`. `where pi` returns nothing. PowerShell's `Get-Command pi` finds it, but the Tauri backend can't use PowerShell resolution.
   - **Workaround**: Set manual Pi binary path in Settings.
   - **Fix**: In `discover_pi()`, on Windows also try appending `.cmd` / `.bat` extensions, or explicitly check `<npm-prefix>/pi.cmd`.

2. **`models.json` missing** — After `pi` is found and RPC connects, the model picker is empty. User had to manually create a `models.json` file in the local pi folder for chat to work.
   - **Fix**: App should guide the user or auto-run model discovery on first run.

3. **Draft release not visible** — GitHub requires repo Settings → Actions → Workflow permissions → "Read and write permissions" for `tauri-action` to create releases on forks.

## Unstaged Changes (need manual commit + push)

Package rename staged but NOT committed (git disabled in AGENTS.md):
- `README.md` — 2 replacements
- `src-tauri/src/lib.rs` — 4 replacements
- `src/main.ts` — 2 replacements
- `dev-log/2026-06-01-handoff-QieB4I.md` — this file

Run: `git add -A && git commit -m "update package name to @earendil-works/pi-coding-agent" && git push july july-dev`

## Artifacts
- `.github/workflows/release.yml` — Modified: Windows-only NSIS build, manual trigger, draft release
- `TODO.md` — Author's massive backlog (architecture, terminal PTY, notifications, resource model)
- `ROADMAP_V1.md` — Author's v1 vision doc (completed)
- `docs/ARCHITECTURE.md` — 3-layer architecture description
- `docs/FEATURE_MAPPING.md` — Feature parity mapping

## Upstream Issues — Prioritized Plan

### Phase 1 — Quick wins (prioritized by Windows testing)
1. **Fix Windows `.cmd` discovery** — In `discover_pi()` (`src-tauri/src/lib.rs`), add `.cmd`/`.bat` resolution for npm-installed `pi`. This is the #1 blocker for Windows users.
2. **Auto-populate models on first run** — After RPC connects, check if models are available. If not, guide user or auto-run model discovery. Files: `src-tauri/src/lib.rs`, `src/main.ts`
3. **Package rename** — Commit staged changes: `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent`
4. **#70** Slash command audit — test all `/` commands, fix broken ones. Files: `src/commands/`, `src/components/chat-view/slash-builtin-command.ts`
5. **#104** API key provider setup in Settings — add paste-API-key UI. Files: `src/components/settings-panel.ts`, `src-tauri/src/lib.rs`

### Phase 2 — Polish
6. **#84** Keyboard shortcuts reliability across OS/layouts
7. Code-split frontend (1.4MB single chunk → dynamic import for heavy components)
8. RPC auto-reconnect / error boundary

### Phase 3 — Architecture
9. **#101** Decompose `main.ts` (4770 lines) and `sidebar.ts` (4208 lines) — follow the pattern already used for `chat-view/` submodules
10. **#67** Native PTY terminal (evaluate `portable-pty` or `tauri-plugin-pty`)
11. Bundle Pi CLI as sidecar for zero-setup install

## Codebase Hotspots (line counts)
| File | Lines | Concern |
|------|-------|---------|
| `src/styles/app.css` | 8648 | All CSS — Tailwind + custom |
| `src/components/packages-view.ts` | 4977 | Package management |
| `src/components/chat-view.ts` | 4830 | Main chat surface |
| `src/main.ts` | 4770 | Monolithic orchestrator |
| `src/components/sidebar.ts` | 4208 | Navigation sidebar |
| `src/components/settings-panel.ts` | 2226 | Settings UI |
| `src-tauri/src/lib.rs` | 2455 | Entire Rust backend |
| `src/rpc/bridge.ts` | 1068 | RPC communication |

## Decisions Log
- Remote `july` uses SSH (`git@github.com:`) because HTTPS push was denied (403) — likely a token scope issue. SSH works fine.
- Release workflow produces draft releases (not published) for safety during development.
- `where pi` returns nothing on Windows even when `pi` works in PowerShell — npm installs `.cmd` wrappers that `which::which()` can't find.
- `models.json` must exist for the model picker to show options — app doesn't auto-generate it.
- Draft releases on fork repos require explicit "Read and write permissions" in GitHub Actions settings.

## Suggested Skills
- `showsignature` — before editing any large file, extract its structural signature first

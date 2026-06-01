# Handoff — 2026-06-01 (updated)

## Purpose
Continue development on the pi-desktop fork (`LCorleone/pi-desktop`, branch `july-dev`). Next session should pick from the prioritized plan below.

## What Was Done
- Investigated the full project architecture: Tauri v2 + Lit/TypeScript frontend, Rust backend, RPC bridge to `pi` CLI.
- Created branch `july-dev` and pushed to `git@github.com:LCorleone/pi-desktop.git` (remote name: `july`).
- Modified `.github/workflows/release.yml` to build Windows exe only (NSIS), manual trigger, draft release.
- Analyzed all 18 open upstream issues on `gustavonline/pi-desktop` and produced a prioritized contribution plan.
- Tested exe on real Windows device — identified and fixed two first-run blockers.
- Updated package name: `@mariozechner/pi-coding-agent` → `@earendil-works/pi-coding-agent`.
- Fixed Windows `.cmd` discovery in `discover_pi()` — added `which::which("pi.cmd")` and `which::which("pi.bat")` fallbacks.
- Added OpenAI-compatible provider config section in Settings — full CRUD for providers and models, saves to `~/.pi/agent/models.json`.
- **UI polish (4 phases)**: Providers CSS cleanup, accent color, Inter font, micro-interactions.

## UI Polish Details (Phases A-D)

### Phase A: Providers Section CSS
- Replaced ~15 inline `style="..."` attributes with proper CSS classes
- Added 17 new CSS classes: `.provider-card`, `.provider-header`, `.provider-body`, `.provider-field`, `.model-grid`, `.model-row`, `.settings-btn-primary/secondary/danger`, `.model-delete-btn`, `.add-model-btn`, `.settings-message-error/success`, etc.
- All styling now uses semantic CSS variables (`--border`, `--text`, `--muted`, `--accent`, `--danger`)

### Phase B: Accent Color & Tokens
- Accent changed from gray (`#7a818f` dark / `#6b7280` light) → blue (`#0285ff`) across all themes
- 76 accent references auto-updated via CSS variable cascade
- `.settings-btn-primary` text fixed to `#fff` for contrast on blue
- 25 hardcoded border-radius values migrated to token variables (7px→`--radius-md`, 9px→`--radius-lg`, etc.)
- 3 bare `:focus` selectors → `:focus-visible` for consistency

### Phase C: Typography
- Added Inter font via `@fontsource/inter` (weights 400, 500, 600, 700)
- `--font-family-sans` now: `"Inter", -apple-system, ...`
- Consolidated 8 different monospace font stacks → single `--font-family-mono` token
- Added `letter-spacing: -0.02em` to page titles (18px+)
- Added line-height tokens for future use

### Phase D: Micro-interactions
- Global transition baseline on all `button`, `a`, `summary`, `[role="button"]` (140ms on bg, border, color, opacity, box-shadow)
- 29 hardcoded transition timings → token variables (`--duration-fast`, `--ease-standard`)
- `:active` press feedback on 10 key elements (workspace tabs, sidebar sessions, settings nav, command rows, model picker, etc.)
- Global `button:active` gets `translateY(0.5px)` tactile feedback

## Current State
- **Branch**: `july-dev` on remote `july` (SSH: `git@github.com:LCorleone/pi-desktop.git`)
- **Original upstream**: `origin` → `https://github.com/gustavonline/pi-desktop.git`
- **Latest commits**: UI polish phases A-D (pending push)
- **Windows exe**: Building via GitHub Actions. Repo Settings → Actions → Workflow permissions must be "Read and write".

## Commits on july-dev (in order)
1. `1c1a17b` — simplify release workflow: Windows exe only, manual trigger
2. `a7e3566` — update package name to @earendil-works/pi-coding-agent + handoff doc
3. `32319b1` — fix windows pi.cmd discovery + add OpenAI-compatible provider config in Settings
4. *(next)* — UI polish: providers CSS, accent color, Inter font, micro-interactions

## Key Files Changed

| File | Changes |
|------|---------|
| `src/styles/tokens.css` | Inter font stack, `--font-family-mono` token, accent→blue, line-height tokens, radius tokens |
| `src/styles/theme.css` | Accent blue in both dark/light themes, accent-soft updated |
| `src/styles/app.css` | +435 lines: provider CSS classes, global transition baseline, normalized timings, active states, Inter imports, monospace consolidation, radius migration |
| `src/components/settings-panel.ts` | Providers section: inline styles → CSS classes, ~114 lines changed |
| `package.json` | Added `@fontsource/inter` |
| `src-tauri/src/lib.rs` | (previous) Windows .cmd discovery, provider config commands |

## Remaining Plan — Phase 1

1. **#70 Slash command audit** — July is testing manually. Fix broken `/` commands. Files: `src/commands/`, `src/components/chat-view/slash-builtin-command.ts`
2. **#104 API key provider setup** — Lower priority now since Providers section covers OpenAI-compatible.

## Phase 2 — Polish
3. **#84** Keyboard shortcuts reliability across OS/layouts
4. Code-split frontend (1.4MB single chunk → dynamic import for heavy components)
5. RPC auto-reconnect / error boundary

## Phase 3 — Architecture
6. **#101** Decompose `main.ts` (4770 lines) and `sidebar.ts` (4208 lines)
7. **#67** Native PTY terminal (evaluate `portable-pty` or `tauri-plugin-pty`)
8. Bundle Pi CLI as sidecar for zero-setup install

## Windows Known Issues (from testing)
- `where pi` returns nothing even when `pi` works in PowerShell — npm `.cmd` wrappers. Fixed by fallback.
- `models.json` must exist for model picker — handled by Providers section in Settings.
- Draft releases on fork repos require "Read and write permissions" in GitHub Actions settings.

## Decisions Log
- Remote `july` uses SSH because HTTPS push was denied (403).
- Release workflow produces draft releases for safety.
- Providers section uses the same `models.json` schema as Pi CLI — no custom format.
- `dirs` crate not added to Cargo.toml — used manual `HOME`/`USERPROFILE` env var resolution.
- Accent blue (`#0285ff`) chosen from existing token palette rather than introducing a new color.
- Inter font chosen as the standard for dev tool UIs (VS Code, Linear, Notion).
- Font-size tokens exist but not migrated — 297 hardcoded values, too much churn for zero visual change.
- Global transition baseline approach preferred over per-selector additions — catches 74 missed elements at once.

## Suggested Skills
- `showsignature` — before editing any large file, extract its structural signature first

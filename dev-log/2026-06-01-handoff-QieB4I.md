# Handoff — 2026-06-01

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

## Current State
- **Branch**: `july-dev` on remote `july` (SSH: `git@github.com:LCorleone/pi-desktop.git`)
- **Original upstream**: `origin` → `https://github.com/gustavonline/pi-desktop.git`
- **Latest commit**: `32319b1` — fix windows pi.cmd discovery + add OpenAI-compatible provider config
- **Windows exe**: Building via GitHub Actions. Repo Settings → Actions → Workflow permissions must be "Read and write".
- **Pending test**: New exe needs testing for Windows `.cmd` discovery fix and Providers section.

## Commits on july-dev (in order)
1. `1c1a17b` — simplify release workflow: Windows exe only, manual trigger
2. `a7e3566` — update package name to @earendil-works/pi-coding-agent + handoff doc
3. `32319b1` — fix windows pi.cmd discovery + add OpenAI-compatible provider config in Settings

## Key Changes Summary

### Fix: Windows `.cmd` Discovery (`src-tauri/src/lib.rs`)
- Added `which::which("pi.cmd")` and `which::which("pi.bat")` fallbacks after the standard `which::which("pi")` fails on Windows
- This fixes the issue where npm installs `pi` as a `.cmd` wrapper that Rust's `which` crate can't find

### Feature: OpenAI-Compatible Provider Config (`src/components/settings-panel.ts` + `src-tauri/src/lib.rs`)
- New "Providers" section in Settings panel (between Account and Updates)
- Added `SettingsSectionId = "providers"`
- Added `load_models_config` / `save_models_config` Tauri commands in Rust backend
- UI: list/edit/delete existing providers, add new providers, manage models per provider
- Saves to `~/.pi/agent/models.json` in the Pi CLI schema format

### models.json schema (for reference)
```json
{
  "providers": {
    "provider-key": {
      "baseUrl": "https://api.example.com/v1",
      "api": "openai-completions",
      "apiKey": "sk-xxx",
      "compat": { "supportsDeveloperRole": false, "supportsReasoningEffort": false },
      "models": [
        { "id": "model-id", "name": "Display Name", "reasoning": true, "input": ["text"], "contextWindow": 128000, "maxTokens": 32000 }
      ]
    }
  }
}
```

## Remaining Plan — Phase 1

1. **#70 Slash command audit** — July is testing manually. Fix broken `/` commands. Files: `src/commands/`, `src/components/chat-view/slash-builtin-command.ts`
2. **#104 API key provider setup** — Lower priority now since Providers section covers OpenAI-compatible. Could still add first-class OAuth/login flows for major providers.

## Phase 2 — Polish
3. **#84** Keyboard shortcuts reliability across OS/layouts
4. Code-split frontend (1.4MB single chunk → dynamic import for heavy components)
5. RPC auto-reconnect / error boundary

## Phase 3 — Architecture
6. **#101** Decompose `main.ts` (4770 lines) and `sidebar.ts` (4208 lines)
7. **#67** Native PTY terminal (evaluate `portable-pty` or `tauri-plugin-pty`)
8. Bundle Pi CLI as sidecar for zero-setup install

## Windows Known Issues (from testing)
- `where pi` returns nothing even when `pi` works in PowerShell — npm `.cmd` wrappers. Should be fixed by the new fallback.
- `models.json` must exist for model picker — now handled by Providers section in Settings.
- Draft releases on fork repos require "Read and write permissions" in GitHub Actions settings.

## Decisions Log
- Remote `july` uses SSH because HTTPS push was denied (403).
- Release workflow produces draft releases for safety.
- Providers section uses the same `models.json` schema as Pi CLI — no custom format.
- `dirs` crate not added to Cargo.toml — used manual `HOME`/`USERPROFILE` env var resolution instead.
- Provider config uses dynamic `invoke()` import matching existing codebase pattern.

## Suggested Skills
- `showsignature` — before editing any large file, extract its structural signature first

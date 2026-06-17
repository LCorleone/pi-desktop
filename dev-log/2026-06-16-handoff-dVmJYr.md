# Handoff — 2026-06-16

## Purpose
Continue QA + follow-ups for the PTY terminal migration on branch `feat/pty-terminal`, pending macOS build verification.

## What Was Done
- Migrated the terminal from a "fake terminal" (per-command shell spawn via `@tauri-apps/plugin-shell`, manual line editing/history/cd-simulation, `script -q` PTY bridge hack) to a **real PTY** using route B2 (self-built `portable-pty` bridge).
- **Backend** (`src-tauri/src/pty.rs`, new ~290 lines): `PtyState` session manager modeled on existing `RpcState`. Four Tauri commands — `pty_spawn`/`pty_write`/`pty_resize`/`pty_kill` — and two events — `pty-data` (base64-encoded bytes) / `pty-exit`. Uses login shell (`-l`) so PATH/profile is correct (replaces old PATH-injection hack). Wired in `lib.rs` (L11 `mod pty`, L2629 `.manage`, L2631-2634 handler registration). Deps added to `Cargo.toml`: `portable-pty = "0.9"`, `base64 = "0.22"`.
- **Frontend** (`src/components/terminal-panel.ts`, **1085 → 400 lines**): pure PTY passthrough. `xterm.onData → pty_write`, `pty-data → base64ToBytes → xterm.write`, `onResize → pty_resize`, `attachCustomKeyEventHandler` for copy/paste/select-all. Public API preserved (`setProjectPath`/`setOnCommandComplete`/`setOnRequestClose`/`focusInput`/`runCommand`) — `main.ts` untouched.
- **Cleanup** (`src-tauri/capabilities/default.json`, −150 lines): removed 30 orphaned `terminal-*` shell scope entries across `shell:allow-execute/spawn/stdin-write`; kept the 3 `binaries/pi` sidecar entries.
- Added `.github/workflows/build-mac.yml`: manual `workflow_dispatch`, **Intel x86_64** (`macos-13` — user is on Intel Core i7), uploads unsigned `.dmg` as artifact. User chose intel after confirming `uname -m` = `x86_64`.
- All automated checks green: `cargo check`, `tsc --noEmit`, `vite build`.

## Current State
- **Working on**: branch `feat/pty-terminal`, local only — **needs commit + push** (this handoff is the last step before that).
- **Blocked on**: **manual macOS QA** by the user (no Tauri GUI in this environment). Build not yet triggered.
- **Known issues / open questions** (need user decision — DO NOT assume):
  1. `onCommandComplete` semantics changed: PTY can't observe exit codes. `runCommand` (chat→terminal forward) now fires with `result:null` at **send** time, not **completion**. main.ts `pi` refresh still triggers, but `pi login/logout` auth probe fires earlier than before. Acceptable? If precise completion detection needed → requires shell `PROMPT_COMMAND` hook (out of current scope).
  2. Closing terminal dock (✕) only hides the panel — the shell process **stays resident**. Add kill-on-close? (conserves resources)
  3. Single shared panel per workspace — switching workspace **respawns** the shell (state lost). True per-tab persistent PTY needs main.ts multi-instance work (larger change).
  4. **Pre-existing dead code** (NOT touched, per surgical-changes rule — flag for user): `@xterm/addon-webgl` declared in package.json but never imported; `binaries/pi` sidecar scope entries have no `externalBin` in `tauri.conf.json` (ineffective config).
  5. `tauri-plugin-shell` still in deps — now only used for `open()` (URLs) across `desktop-updates.ts`/`packages-view.ts`/`chat-view.ts`. NOT removed (out of scope).

## Artifacts
- `src-tauri/src/pty.rs` — PTY session manager (spawn/write/resize/kill + reader thread).
- `src/components/terminal-panel.ts` — rewritten as PTY passthrough (was fake terminal).
- `src-tauri/src/lib.rs:11,2629,2631-2634` — pty module wiring.
- `src-tauri/Cargo.toml:27-28` — new deps.
- `src-tauri/capabilities/default.json` — orphaned terminal scopes removed.
- `.github/workflows/build-mac.yml` — Intel mac build (manual trigger).
- `TODO.md:31-57` — "Terminal architecture reset" notes; route B (recommended) now implemented. **TODO.md itself not yet updated** to reflect completion.
- Prior design analysis: this conversation's earlier messages contain the full feasibility/cost analysis (route B1 plugin vs B2 self-built; B2 chosen).

## QA checklist (for the user, after installing the macOS build)
Install unsigned build: mount dmg → drag to Applications → `xattr -cr "/Applications/Pi Desktop.app"`. Then test (✨ = behavior changed/improved by PTY):
1. Basic: `ls`/`pwd`/`echo` (real shell prompt now)
2. `cd` ✨ (real shell cd, no probe simulation)
3. `pi` interactive ✨ (no `script` bridge, native PTY TUI)
4. `pi login`/`pi logout` ✨ (Windows now supported too)
5. Ctrl+C interrupt (sends `\x03`)
6. Resize ✨ (live, was not supported before)
7. Command history ✨ (shell-native, incl. ~/.zsh_history)
8. TUI apps ✨ (`vim`/`less`/`htop`, were impossible before)
9. Copy/paste (Cmd+C/V, Ctrl+Shift+C/V)
10. Workspace switch (shell respawns to new cwd)
11. Clear button (sends Ctrl+L)

## Suggested Skills
- None required. The work is straightforward follow-up (TODO.md update, optional kill-on-close / per-tab PTY).

## Decisions Log
- **Route B2 (self-built portable-pty) over B1 (tauri-plugin-pty)**: user chose B2. Reasons: ~200-line backend with existing `RpcState` as template; full control over env/login-shell/PATH (critical for this app); avoids pinning a 0.x single-author plugin; `portable-pty` (wezterm, 850k downloads/mo) is far more stable.
- **Skipped Phase 0 spike**: user chose to skip — design was confident enough; binary transport design (base64 out / utf-8 in) decided upfront.
- **Binary transport**: output = base64 (PTY output has arbitrary bytes; base64 avoids the `number[]` regression bug logged in TODO.md:31-57). Input = plain UTF-8 (keystrokes are text).
- **Login shell (`-l`)** on Unix: restores full PATH from ~/.zshrc/~/.bash_profile — replaces the old `withPosixPathPrelude` PATH-injection hack that the deleted code did.
- **macOS runner = `macos-13` (Intel)**: user's machine is Intel i7, not Apple Silicon.

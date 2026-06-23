# TODO

Personal fork of [gustavonline/pi-desktop](https://github.com/gustavonline/pi-desktop).

## ✅ Done

### Core
- [x] Windows release workflow (NSIS `.exe`, manual dispatch)
- [x] macOS build workflow (unsigned `.dmg`, cross-compile x86_64 on Silicon)
- [x] Combined Windows + macOS CI (single workflow_dispatch)
- [x] CI auto-release on merge to main (build + tag + publish)
- [x] Auto session naming via `pi --print` (works with any model, no config parsing)
- [x] Streaming performance fix (rAF render coalescing)
- [x] Real PTY terminal backend (`portable-pty` Rust bridge)
- [x] Window controls + sidebar layout for Windows
- [x] Grey gradient app icon
- [x] README + docs updated for fork

### Thinking & Tools
- [x] Thinking display overhaul (shimmer animation, auto-expand/collapse, caret toggle)
- [x] Tool-type icons + labels + status dots (terminal/read/write/edit/search/agent)
- [x] Subagent display overhaul (robot icon, structured completion card, rolling output)
- [x] Workflow timeline status rail (colored nodes, sans-refresh polish)
- [x] Sans-refresh typography (sans chrome, mono code/terminal/tools)

### Files & Diffs
- [x] Modified files cards after agent edits (diff stats +N -M)
- [x] Diff viewer in file panel (red/green unified diff from oldText/newText)
- [x] File tree refresh on agent run-end + window focus
- [x] File panel header two-line wrap (filename stays visible)

### Stats & Polish
- [x] Per-turn stats footer (tps + cache hit-rate)
- [x] Extension UI dialog fix (invisible permission gates → visible)
- [x] macOS model picker clipping fix (stacking context)
- [x] Session runtime dispose fix (no zombie pi processes on tab close)
- [x] 24 UI polish fixes (text sizes, focus rings, working indicator, contrast)

## 🟡 Next

### Terminal
- [x] Adjustable terminal dock height (drag handle) — came with PTY merge
- [ ] Multi-terminal sessions/tabs within the dock
- [ ] Persisted command history per workspace

### Auth
- [ ] Native OAuth flow for `/login` + `/logout` (currently shows terminal guidance)

### UI polish
- [ ] New-file draft UX pass
- [ ] `/tree` visual polish (deep-session readability)

### QA smokes
- [ ] Long code block rendering (horizontal + vertical scroll)
- [ ] Mixed markdown copy button behavior
- [ ] Manual collapse persistence across multi-tool runs

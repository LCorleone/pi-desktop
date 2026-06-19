# TODO

Personal fork of [gustavonline/pi-desktop](https://github.com/gustavonline/pi-desktop).

## ✅ Done

- [x] Windows release workflow (NSIS `.exe`, manual dispatch)
- [x] macOS build workflow (unsigned `.dmg`, cross-compile x86_64 on Silicon)
- [x] Combined Windows + macOS CI (single workflow_dispatch)
- [x] Auto session naming via `pi --print` (works with any model, no config parsing)
- [x] Streaming performance fix (rAF render coalescing)
- [x] Real PTY terminal backend (`portable-pty` Rust bridge, merged from `feat/pty-terminal`)
- [x] Window controls + sidebar layout for Windows
- [x] JetBrains Mono as default font
- [x] Grey gradient app icon
- [x] README + docs updated for fork
- [x] Thinking display overhaul (shimmer animation, auto-expand/collapse, caret toggle)
- [x] Tool-type icons + labels + status dots (terminal/read/write/edit/search/agent)
- [x] Subagent display overhaul (robot icon, structured completion card, rolling output)
- [x] Extension UI dialog fix (invisible permission gates → visible, overlay-hides fix)
- [x] 24 UI polish fixes (text sizes, focus rings, working indicator, model-picker contrast)
- [x] macOS model picker clipping fix (stacking context / z-index)

## 🟡 Next

### Terminal
- [x] Adjustable terminal dock height (drag handle) — came with PTY merge
- [ ] Multi-terminal sessions/tabs within the dock
- [ ] Persisted command history per workspace

### Auth
- [ ] Native OAuth flow for `/login` + `/logout` (currently shows terminal guidance)

### UI polish
- [ ] New-file draft UX pass
- [ ] Session delete/select stability
- [ ] `/tree` visual polish (deep-session readability)

### QA smokes
- [ ] Long code block rendering (horizontal + vertical scroll)
- [ ] Mixed markdown copy button behavior
- [ ] Manual collapse persistence across multi-tool runs

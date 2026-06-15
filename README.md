# Pi Desktop

A native-feeling desktop shell for the **Pi Coding Agent** CLI (`pi --mode rpc`).

<p align="left">
  <a href="https://github.com/LCorleone/pi-desktop/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/LCorleone/pi-desktop/ci.yml?branch=july-dev&style=for-the-badge" /></a>
  <a href="https://github.com/LCorleone/pi-desktop/releases"><img alt="Releases" src="https://img.shields.io/github/v/release/LCorleone/pi-desktop?include_prereleases&style=for-the-badge" /></a>
  <a href="./LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-6b7280?style=for-the-badge" /></a>
</p>

<p align="left">
  <img src="./assets/branding/pi-desktop-icon.svg" alt="Pi Desktop app icon" width="120" />
</p>

> **Note — this is a personal fork.** All credit for the original project goes to
> [`gustavonline/pi-desktop`](https://github.com/gustavonline/pi-desktop). This fork
> (`LCorleone/pi-desktop`) carries my own build/release workflow and tweaks; please file
> upstream design issues against the original repo.

<!--
Screenshot placeholder: the original README linked an upstream user-attachments image.
Add your own screenshot here, e.g.:
![Pi Desktop](./assets/screenshots/main.png)
-->

---

## What it is

Pi Desktop is a minimal desktop shell for the Pi Coding Agent. It is deliberately
**extension-first**:

- the desktop app is the host/shell (windows, panes, files, tabs, notifications),
- the `pi` CLI is the runtime,
- packages/extensions provide optional behavior and workflows.

The shell stays out of the way — product logic and automation belong in Pi and its
packages, not hardcoded into the app.

---

## Features

- **Multi-workspace** project-aware desktop shell with pin/reorder semantics
- **Session-first chat** with streaming, tools, and a compact thinking timeline
- **Composer slash palette** — deterministic built-in commands plus runtime-discovered extension/skill/prompt commands
- **Model/provider picker** with provider grouping, login/logout actions, and auth diagnostics
- **Docked terminal** (xterm) panel inside chat
- **Right-side file split** with resize, drag/drop attachments, and file reference pills
- **Package manager** pane (`pi install/remove/update/list`) with capability-driven settings
- **Themes** — bundled desktop themes, CLI-schema-compatible theme handling
- **Settings & updates** — no-project-safe UX, manual CLI path override, in-app desktop + CLI update checks

Full capability map: [`FEATURE_MAPPING.md`](./FEATURE_MAPPING.md).

---

## Download

Releases live at **[github.com/LCorleone/pi-desktop/releases](https://github.com/LCorleone/pi-desktop/releases)**.

> **Be accurate about this fork's builds:** the release workflow here
> ([`.github/workflows/release.yml`](./.github/workflows/release.yml)) is a
> **manual (`workflow_dispatch`) Windows-only** build. It produces an **NSIS `.exe`
> installer** and uploads it to a **draft release** tagged `manual-build-<run_number>`
> on the `july-dev` branch.
>
> - There are **no macOS or Linux artifacts** produced by this fork's workflow.
> - Drafts may not appear on the "latest" release pointer — check the full
>   [Releases list](https://github.com/LCorleone/pi-desktop/releases) and look for
>   `manual-build-*` tags.
> - For other platforms, or to customize the build, use **Build from source** below.

### Unsigned build notes (Windows SmartScreen)

Builds are **unsigned**. On first run, Windows SmartScreen may warn:

1. Click **More info**
2. Click **Run anyway**

---

## First run

On launch, Pi Desktop checks for the `pi` CLI. If it is missing, the app shows an
onboarding card with install instructions:

```bash
npm install -g @earendil-works/pi-coding-agent
```

- This installs a **public npm package** (`@earendil-works/pi-coding-agent`) — no npm auth token required.
- Pi Desktop itself is distributed via **GitHub Releases**, not npm.

Then click **Retry** in-app.

---

## Build from source

### Prerequisites

- Node.js >= 22
- Rust toolchain
- Platform build dependencies for Tauri 2

### Dev

```bash
npm install
npm run tauri dev
```

### Production build

```bash
npm run check
npm run build:frontend
npm run tauri build
```

Artifacts are generated under:

```
src-tauri/target/release/bundle/
```

---

## Architecture

Deep dives: **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** and
**[`docs/CAPABILITY_MODEL.md`](./docs/CAPABILITY_MODEL.md)**.

Short version:

- **Frontend (Lit + TypeScript)** — UI shell, panes, interactions. *(This project uses **Lit**, not React.)*
- **Tauri backend (Rust)** — native bridge, CLI process management, filesystem/window commands
- **Pi RPC bridge** — typed JSON-RPC-style line protocol over stdin/stdout
- **Packages/extensions** — opt-in behavior and UI integrations through the extension UI protocol

---

## Packages

See **[`docs/PACKAGES.md`](./docs/PACKAGES.md)**. Packages are first-class building blocks:
install globally or per project, surface loaded resources in-app, and keep policy/automation
outside the shell when possible.

## Security and permissions

See **[`docs/PERMISSIONS.md`](./docs/PERMISSIONS.md)**. Tauri capabilities currently include the
filesystem and shell permissions needed to run Pi and manage project resources — review before
deploying in restricted environments.

## Releases

See **[`docs/RELEASES.md`](./docs/RELEASES.md)** and **[`docs/ICONS.md`](./docs/ICONS.md)**
(icon source, regeneration, and validation).

---

## Contributing

- Read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Open an issue before large changes
- Keep changes aligned with the extension-first architecture and minimal UX goals

---

## License

MIT — see [`LICENSE`](./LICENSE).

---

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=LCorleone/pi-desktop&type=Date)](https://www.star-history.com/#LCorleone/pi-desktop&Date)

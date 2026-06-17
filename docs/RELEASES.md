# Releases

This fork uses GitHub Actions for CI and manual Windows/macOS release builds.

## Latest release

See **[GitHub Releases](https://github.com/LCorleone/pi-desktop/releases)** for available downloads.

Releases are tagged `manual-build-<number>` and published as draft releases from the
`july-dev` branch.

## Workflows

- `.github/workflows/ci.yml`
  - TypeScript checks and frontend build
  - Rust check (Linux only)
- `.github/workflows/release.yml`
  - **Manual trigger (`workflow_dispatch`)** — Windows NSIS `.exe` installer
  - Uploads to a draft GitHub Release
- `.github/workflows/build-mac.yml`
  - **Manual trigger (`workflow_dispatch`)** — macOS unsigned `.dmg`
  - Builds x86_64 on Apple Silicon runner (cross-compile)

## Release process

1. Trigger the desired workflow from the **Actions** tab
2. Wait for build to complete (~8-10 min)
3. Go to **[Releases](https://github.com/LCorleone/pi-desktop/releases)** → find the draft
4. Paste release notes from `releases/` folder
5. Click **Publish release**

---

## Unsigned build notes

### Windows (SmartScreen)
1. Click **More info**
2. Click **Run anyway**

### macOS (Gatekeeper)
```bash
xattr -cr /Applications/Pi\ Desktop.app
```

Or: **System Settings → Privacy & Security** → **Open Anyway**

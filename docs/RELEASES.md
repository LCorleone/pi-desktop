# Releases

This fork uses GitHub Actions for CI and automated release builds.

## Latest release

See **[GitHub Releases](https://github.com/LCorleone/pi-desktop/releases)** for available downloads.

## Auto-release on merge

When a `releases/v*.md` file is pushed to `main`, the `release-on-merge.yml` workflow:
- Detects the latest version from the filename
- Builds Windows `.exe` (NSIS) + macOS `.dmg` (Intel x86_64) in parallel
- Tags `v<X.Y.Z>` and publishes a public GitHub Release automatically
- Uses the release note file content as the release body

Idempotent — skips if the tag already exists.

## Manual release

A manual `workflow_dispatch` is also available via `release.yml` for one-off builds.

## Workflows

- `.github/workflows/ci.yml` — TypeScript checks and frontend build, Rust check
- `.github/workflows/release-on-merge.yml` — Auto-release on `releases/v*.md` push to main
- `.github/workflows/release.yml` — Manual trigger, Windows + macOS

---

## Unsigned build notes

### Windows (SmartScreen)
1. Click **More info**
2. Click **Run anyway**

### macOS (Gatekeeper)
```bash
xattr -cr /Applications/Pi\ Desktop.app
```

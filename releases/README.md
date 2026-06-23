# Release Notes

This folder stores the release notes for each published release of the
`LCorleone/pi-desktop` fork.

## Files

| File | Release | Notes |
|------|---------|-------|
| [`v1.7.1.md`](./v1.7.1.md) | Per-Turn Stats & Auto-Release | TPS + cache hit-rate footer, CI auto-release on merge |
| [`v1.7.0.md`](./v1.7.0.md) | Sans-Refresh UI Polish | Sans chrome / mono code split, workflow status rail + nodes, agent divider + active-session bar, density polish |
| [`v1.6.0.md`](./v1.6.0.md) | Modified Files & Diff Viewer | File cards with diff stats, diff viewer in file panel, session stability, mac fixes |
| [`v1.4.0.md`](./v1.4.0.md) | Thinking Render Fix | ANSI stripping, workflow thinking label, macOS PATH fix |
| [`v1.3.0.md`](./v1.3.0.md) | UI Polish & Thinking | Shimmer animation, tool icons, 24 CSS fixes, grey icon, terminal fixes |
| [`v1.2.0.md`](./v1.2.0.md) | PTY Terminal & Auto-Naming | Native PTY backend, pi --print titles, combined Win+Mac CI |
| [`v1.1.0.md`](./v1.1.0.md) | Auto-naming & Performance | pi --print title generation, streaming rAF coalesce, Windows polish |
| [`v1.0.0.md`](./v1.0.0.md) | First release | Auto session naming, streaming perf, Windows improvements, UI polish |

## Convention

- One Markdown file per release, named after the release tag/version:
  `v<version>.md` (e.g. `v1.0.0.md`, `v1.1.0.md`).
- The file content is what gets pasted into the GitHub Release description.
- Update this README's table when adding a new release note.

## Auto-release

Merging to `main` with a new or changed `releases/v*.md` automatically builds
the Windows `.exe` + macOS `.dmg`, tags `v<version>`, and publishes a
**pre-release** whose body is that release note.

- Workflow: [`.github/workflows/release-on-merge.yml`](../.github/workflows/release-on-merge.yml)
- Trigger: any push to `main` that changes a file matching `releases/v*.md`.
- Idempotent: if tag `v<version>` already exists, the build is skipped (safe to re-merge).
- To cut a release: add `releases/vX.Y.Z.md`, update the index table above, merge to `main`.
- The manual `release.yml` workflow (draft `manual-build-<N>`) remains available on any branch.

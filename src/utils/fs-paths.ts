/**
 * Canonical filesystem path helpers shared across the desktop shell.
 *
 * These replace per-file copy-pasted versions that had drifted apart
 * (windows-separator preservation vs posix normalization, different
 * fallbacks for degenerate inputs). All helpers normalize backslashes to
 * forward slashes: every consumer feeds these paths into Tauri fs
 * commands, which accept forward slashes on all platforms.
 */

/** Join a base path and a child segment into one normalized path. */
export function joinFsPath(base: string, child: string): string {
	const normalizedBase = base.replace(/\\/g, "/").replace(/\/+$/, "");
	const normalizedChild = child.replace(/\\/g, "/").replace(/^\/+/, "");
	return normalizedBase ? `${normalizedBase}/${normalizedChild}` : normalizedChild;
}

/** Return the final path segment ("foo/bar/baz.md" -> "baz.md"). */
export function pathBaseName(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/");
	return parts[parts.length - 1] || normalized || path;
}

/** Return everything before the final path segment ("/a/b/c" -> "/a/b"). */
export function pathDirName(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const idx = normalized.lastIndexOf("/");
	if (idx === -1) return "";
	if (idx === 0) return "/";
	return normalized.slice(0, idx);
}

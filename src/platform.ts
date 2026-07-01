/**
 * Platform detection. Tags <html> with a platform class so CSS can scope
 * platform-specific overrides (e.g. macOS WebKit compositing fixes).
 */

export type Platform = "macos" | "windows" | "linux" | "other";

function detectPlatform(): Platform {
	if (typeof navigator === "undefined") return "other";
	const ua = navigator.userAgent || "";
	const platform = (navigator.platform || "").toLowerCase();
	// iPadOS 13+ reports a Mac user agent; treat as macOS.
	const isMac = /mac/i.test(platform) || /mac os x/i.test(ua);
	const isWin = /win/i.test(platform) || /windows/i.test(ua);
	const isLinux = /linux/i.test(platform) && !/android/i.test(ua);
	if (isMac) return "macos";
	if (isWin) return "windows";
	if (isLinux) return "linux";
	return "other";
}

export const PLATFORM: Platform = detectPlatform();

export const IS_MACOS = PLATFORM === "macos";

/** Apply the detected platform class to <html>. Safe to call at module load. */
export function applyPlatformClass(): void {
	const root = document.documentElement;
	root.classList.remove("platform-macos", "platform-windows", "platform-linux", "platform-other");
	root.classList.add(`platform-${PLATFORM}`);
}

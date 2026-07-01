/**
 * Pure-JS sRGB color mixing.
 *
 * Used to precompute `color-mix(in srgb, ...)` values at runtime so theme
 * tokens resolve to plain rgb() strings instead of color-mix() expressions.
 * This avoids nested color-mix, which older WKWebView (macOS Catalina,
 * AppleWebKit/605.1.15) does not support and silently drops, causing
 * backgrounds to render transparent.
 */

type RGB = [number, number, number];

const NAMED_COLORS: Record<string, RGB> = {
	transparent: [0, 0, 0],
	black: [0, 0, 0],
	white: [255, 255, 255],
	red: [255, 0, 0],
	green: [0, 128, 0],
	blue: [0, 0, 255],
};

function clamp(v: number, min = 0, max = 255): number {
	return Math.min(max, Math.max(min, v));
}

function parseHex(hex: string): RGB | null {
	const h = hex.replace("#", "");
	if (h.length === 3) {
		return [
			parseInt(h[0] + h[0], 16),
			parseInt(h[1] + h[1], 16),
			parseInt(h[2] + h[2], 16),
		];
	}
	if (h.length === 6 || h.length === 8) {
		return [
			parseInt(h.slice(0, 2), 16),
			parseInt(h.slice(2, 4), 16),
			parseInt(h.slice(4, 6), 16),
		];
	}
	return null;
}

function parseRgbParts(inner: string): RGB | null {
	const parts = inner.split(",").map((p) => p.trim());
	const nums: number[] = [];
	for (let i = 0; i < 3 && i < parts.length; i++) {
		const p = parts[i];
		if (p.endsWith("%")) {
			nums.push((parseFloat(p) / 100) * 255);
		} else {
			nums.push(parseFloat(p));
		}
	}
	if (nums.length < 3 || nums.some((n) => Number.isNaN(n))) return null;
	return [clamp(nums[0]), clamp(nums[1]), clamp(nums[2])];
}

/** Parse a CSS color string (hex, rgb(), named black/white/transparent) to sRGB. Returns null if unsupported. */
export function parseSrgbColor(input: string): RGB | null {
	const v = input.trim().toLowerCase();
	if (!v) return null;
	if (NAMED_COLORS[v]) return NAMED_COLORS[v];
	if (v.startsWith("#")) return parseHex(v);
	const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(v);
	if (rgbMatch) return parseRgbParts(rgbMatch[1]);
	// hsl() / oklch() / etc. are not supported here on purpose — theme background
	// colors in this app are hex or rgb(). If we hit something else, return null
	// and the caller will keep the original color-mix() string as a fallback.
	return null;
}

/**
 * Mix two colors in sRGB like CSS `color-mix(in srgb, c1 p1%, c2 p2%)`.
 * p1 is the percentage of c1 (0-100). c2 gets the remainder.
 * If a color can't be parsed, returns null (caller falls back to color-mix() string).
 */
export function srgbMix(c1: string, p1: number, c2: string): string | null {
	const a = parseSrgbColor(c1);
	const b = parseSrgbColor(c2);
	if (!a || !b) return null;
	const p = Math.min(100, Math.max(0, p1)) / 100;
	const mixed: RGB = [
		Math.round(a[0] * p + b[0] * (1 - p)),
		Math.round(a[1] * p + b[1] * (1 - p)),
		Math.round(a[2] * p + b[2] * (1 - p)),
	];
	return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

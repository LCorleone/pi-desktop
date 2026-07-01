/**
 * Pure-JS sRGB color mixing.
 *
 * Used to precompute `color-mix(in srgb, ...)` values at runtime so theme
 * tokens resolve to plain rgb()/rgba() strings instead of color-mix()
 * expressions. This avoids nested color-mix, which older WKWebView (macOS
 * Catalina, AppleWebKit/605.1.15) does not support and silently drops, causing
 * backgrounds to render transparent.
 *
 * Alpha semantics: CSS `color-mix(in srgb, C p%, transparent)` yields
 * `rgba(C, p/100)` — a translucent color. We replicate that by emitting
 * rgba() with the appropriate alpha whenever either operand is `transparent`,
 * instead of treating transparent as opaque black.
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
	// Support both legacy "r, g, b" and modern "r g b" / "r g b / a" syntax.
	const cleaned = inner.replace("/", " ").replace(/%/g, "");
	// Split on either commas or whitespace.
	const parts = cleaned.split(/[,\s]+/).map((p) => p.trim()).filter((p) => p.length > 0);
	const nums: number[] = [];
	for (let i = 0; i < 3 && i < parts.length; i++) {
		nums.push(parseFloat(parts[i]));
	}
	if (nums.length < 3 || nums.some((n) => Number.isNaN(n))) return null;
	// In modern "r g b" syntax (no commas), values 0-1 are not auto-scaled to
	// 0-255 (that's only `rgb()` percentage-less in legacy); but theme values
	// here are always 0-255 or percentages. Treat 0..1 only as-is; clamp the rest.
	return [clamp(nums[0]), clamp(nums[1]), clamp(nums[2])];
}

/** Parse a CSS color string (hex, rgb()/rgba() legacy & modern, named black/white/transparent) to sRGB. Returns null if unsupported. */
export function parseSrgbColor(input: string): RGB | null {
	const v = input.trim().toLowerCase();
	if (!v) return null;
	if (NAMED_COLORS[v]) return NAMED_COLORS[v];
	if (v.startsWith("#")) return parseHex(v);
	const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(v);
	if (rgbMatch) return parseRgbParts(rgbMatch[1]);
	// hsl() / oklch() / color() / etc. are not supported here — return null so
	// the caller falls back to the original color-mix() string.
	return null;
}

function round4(v: number): number {
	return Math.round(v * 10000) / 10000;
}

/**
 * Mix two colors in sRGB like CSS `color-mix(in srgb, c1 p1%, c2)`.
 * p1 is the percentage of c1 (0-100). c2 gets the remainder.
 *
 * Alpha-aware: when either operand is `transparent`, the result is an
 * `rgba(...)` with the correct alpha (matching CSS color-mix semantics),
 * rather than a straight opaque RGB interpolation.
 *
 * Returns null if a color can't be parsed (caller falls back to color-mix()).
 */
export function srgbMix(c1: string, p1: number, c2: string): string | null {
	const a = parseSrgbColor(c1);
	const b = parseSrgbColor(c2);
	if (!a || !b) return null;
	const p = clamp(p1, 0, 100) / 100;

	const aTransparent = c1.trim().toLowerCase() === "transparent";
	const bTransparent = c2.trim().toLowerCase() === "transparent";

	if (aTransparent && bTransparent) {
		return "rgba(0, 0, 0, 0)";
	}
	// transparent contributes alpha 0; the opaque color's RGB is used directly,
	// and its alpha weight is p (if it's c1) or (1-p) (if it's c2).
	if (aTransparent) {
		return `rgba(${b[0]}, ${b[1]}, ${b[2]}, ${round4(1 - p)})`;
	}
	if (bTransparent) {
		return `rgba(${a[0]}, ${a[1]}, ${a[2]}, ${round4(p)})`;
	}

	const mixed: RGB = [
		Math.round(a[0] * p + b[0] * (1 - p)),
		Math.round(a[1] * p + b[1] * (1 - p)),
		Math.round(a[2] * p + b[2] * (1 - p)),
	];
	return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

/**
 * Build an `rgba(r, g, b, alpha)` string from a color and an alpha (0-1).
 * Returns null if the color can't be parsed.
 */
export function srgbAlpha(color: string, alpha: number): string | null {
	const rgb = parseSrgbColor(color);
	if (!rgb) return null;
	return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${round4(alpha)})`;
}

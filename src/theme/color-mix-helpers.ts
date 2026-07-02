/**
 * Pure-JS sRGB color mixing.
 *
 * Used to precompute `color-mix(in srgb, ...)` values at runtime so theme
 * tokens resolve to plain rgb()/rgba() strings instead of color-mix()
 * expressions. This avoids nested color-mix, which older WKWebView (macOS
 * Catalina, AppleWebKit/605.1.15) does not support and silently drops, causing
 * backgrounds to render transparent.
 *
 * Alpha semantics: mixing is performed with premultiplied alpha via the shared
 * `mixColors` core, matching CSS `color-mix(in srgb, ...)` — `transparent` is
 * treated as a color with alpha 0 rather than opaque black, so a mix of an
 * opaque color with `transparent` yields an rgba() with the correct alpha.
 */

type RGBA = [number, number, number, number];

const NAMED: Record<string, RGBA> = {
	transparent: [0, 0, 0, 0],
	black: [0, 0, 0, 1],
	white: [255, 255, 255, 1],
	red: [255, 0, 0, 1],
	green: [0, 128, 0, 1],
	blue: [0, 0, 255, 1],
};

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/** Parse a concrete CSS color (hex / rgb() / rgba() legacy & modern / named) to [r,g,b,a]. */
export function parseColorRgba(raw: string): RGBA | null {
	const v = raw.trim().toLowerCase();
	if (!v) return null;
	if (NAMED[v]) return NAMED[v];
	if (v.startsWith("#")) {
		const h = v.slice(1);
		const hx = (s: string) => parseInt(s, 16);
		if (h.length === 3) return [hx(h[0] + h[0]), hx(h[1] + h[1]), hx(h[2] + h[2]), 1];
		if (h.length === 6) return [hx(h.slice(0, 2)), hx(h.slice(2, 4)), hx(h.slice(4, 6)), 1];
		if (h.length === 8) return [hx(h.slice(0, 2)), hx(h.slice(2, 4)), hx(h.slice(4, 6)), hx(h.slice(6, 8)) / 255];
		return null;
	}
	const m = /^rgba?\(([^)]+)\)$/.exec(v);
	if (!m) return null;
	const inner = m[1].replace("/", " ");
	const toks = inner.split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.length > 0);
	if (toks.length < 3) return null;
	const chan = (tok: string, isAlpha: boolean): number | null => {
		if (tok.endsWith("%")) {
			const n = parseFloat(tok);
			if (Number.isNaN(n)) return null;
			return isAlpha ? n / 100 : (n / 100) * 255;
		}
		const n = parseFloat(tok);
		if (Number.isNaN(n)) return null;
		return n;
	};
	const r = chan(toks[0], false);
	const g = chan(toks[1], false);
	const b = chan(toks[2], false);
	const a = toks.length >= 4 ? chan(toks[3], true) : 1;
	if (r === null || g === null || b === null || a === null) return null;
	return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255), clamp(a, 0, 1)];
}

function round4(v: number): number {
	return Math.round(v * 10000) / 10000;
}

/**
 * Premultiplied-alpha sRGB mix, matching CSS `color-mix(in srgb, A pA%, B pB%)`.
 * pA and pB are 0..1 weights; they are normalized internally so callers may pass
 * un-normalized percentages (e.g. 0.2 / 0.8, or 1 / 4). Returns an rgb()/rgba()
 * string, or null if either color cannot be parsed.
 */
export function mixColors(a: string, pA: number, b: string, pB: number): string | null {
	const ca = parseColorRgba(a);
	const cb = parseColorRgba(b);
	if (!ca || !cb) return null;
	const sum = pA + pB;
	if (sum <= 0) return "rgba(0, 0, 0, 0)";
	const wa = pA / sum;
	const wb = pB / sum;
	const outAlpha = wa * ca[3] + wb * cb[3];
	if (outAlpha <= 1e-4) return "rgba(0, 0, 0, 0)";
	const r = Math.round((wa * ca[3] * ca[0] + wb * cb[3] * cb[0]) / outAlpha);
	const g = Math.round((wa * ca[3] * ca[1] + wb * cb[3] * cb[1]) / outAlpha);
	const bl = Math.round((wa * ca[3] * ca[2] + wb * cb[3] * cb[2]) / outAlpha);
	const aR = Math.round(outAlpha * 10000) / 10000;
	return aR >= 1 ? `rgb(${r}, ${g}, ${bl})` : `rgba(${r}, ${g}, ${bl}, ${aR})`;
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
	return mixColors(c1, p1, c2, 100 - p1);
}

/**
 * Build an `rgba(r, g, b, alpha)` string from a color and an alpha (0-1).
 * Returns null if the color can't be parsed.
 */
export function srgbAlpha(color: string, alpha: number): string | null {
	const rgb = parseColorRgba(color);
	if (!rgb) return null;
	return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${round4(alpha)})`;
}

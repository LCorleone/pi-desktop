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
	// Extended CSS named colors. Pi themes may specify accents as named colors
	// (e.g. light-thinking.json uses "teal"); before this table existed those
	// failed parseColorRgba, so the macOS color-mix polyfill skipped the whole
	// declaration and the broken WKWebView rendered the raw first operand
	// (a solid color block) instead of the intended tint. See 0d4d5de.
	aqua: [0, 255, 255, 1],
	azure: [240, 255, 255, 1],
	beige: [245, 245, 220, 1],
	bisque: [255, 228, 196, 1],
	blanchedalmond: [255, 235, 205, 1],
	blueviolet: [138, 43, 226, 1],
	brown: [165, 42, 42, 1],
	burlywood: [222, 184, 135, 1],
	cadetblue: [95, 158, 160, 1],
	chartreuse: [127, 255, 0, 1],
	chocolate: [210, 105, 30, 1],
	coral: [255, 127, 80, 1],
	cornflowerblue: [100, 149, 237, 1],
	cornsilk: [255, 248, 220, 1],
	crimson: [220, 20, 60, 1],
	cyan: [0, 255, 255, 1],
	darkblue: [0, 0, 139, 1],
	darkcyan: [0, 139, 139, 1],
	darkgoldenrod: [184, 134, 11, 1],
	darkgray: [169, 169, 169, 1],
	darkgreen: [0, 100, 0, 1],
	darkgrey: [169, 169, 169, 1],
	darkkhaki: [189, 183, 107, 1],
	darkmagenta: [139, 0, 139, 1],
	darkolivegreen: [85, 107, 47, 1],
	darkorange: [255, 140, 0, 1],
	darkorchid: [153, 50, 204, 1],
	darkred: [139, 0, 0, 1],
	darksalmon: [233, 150, 122, 1],
	darkseagreen: [143, 188, 143, 1],
	darkslateblue: [72, 61, 139, 1],
	darkslategray: [47, 79, 79, 1],
	darkslategrey: [47, 79, 79, 1],
	darkturquoise: [0, 206, 209, 1],
	darkviolet: [148, 0, 211, 1],
	deeppink: [255, 20, 147, 1],
	deepskyblue: [0, 191, 255, 1],
	dimgray: [105, 105, 105, 1],
	dimgrey: [105, 105, 105, 1],
	dodgerblue: [30, 144, 255, 1],
	firebrick: [178, 34, 34, 1],
	floralwhite: [255, 250, 240, 1],
	forestgreen: [34, 139, 34, 1],
	fuchsia: [255, 0, 255, 1],
	gainsboro: [220, 220, 220, 1],
	ghostwhite: [248, 248, 255, 1],
	gold: [255, 215, 0, 1],
	goldenrod: [218, 165, 32, 1],
	gray: [128, 128, 128, 1],
	greenyellow: [173, 255, 47, 1],
	grey: [128, 128, 128, 1],
	honeydew: [240, 255, 240, 1],
	hotpink: [255, 105, 180, 1],
	indianred: [205, 92, 92, 1],
	indigo: [75, 0, 130, 1],
	ivory: [255, 255, 240, 1],
	khaki: [240, 230, 140, 1],
	lavender: [230, 230, 250, 1],
	lavenderblush: [255, 240, 245, 1],
	lawngreen: [124, 252, 0, 1],
	lemonchiffon: [255, 250, 205, 1],
	lightblue: [173, 216, 230, 1],
	lightcoral: [240, 128, 128, 1],
	lightcyan: [224, 255, 255, 1],
	lightgoldenrodyellow: [250, 250, 210, 1],
	lightgray: [211, 211, 211, 1],
	lightgreen: [144, 238, 144, 1],
	lightgrey: [211, 211, 211, 1],
	lightpink: [255, 182, 193, 1],
	lightsalmon: [255, 160, 122, 1],
	lightseagreen: [32, 178, 170, 1],
	lightskyblue: [135, 206, 250, 1],
	lightslategray: [119, 136, 153, 1],
	lightslategrey: [119, 136, 153, 1],
	lightsteelblue: [176, 196, 222, 1],
	lightyellow: [255, 255, 224, 1],
	lime: [0, 255, 0, 1],
	limegreen: [50, 205, 50, 1],
	linen: [250, 240, 230, 1],
	magenta: [255, 0, 255, 1],
	maroon: [128, 0, 0, 1],
	mediumaquamarine: [102, 205, 170, 1],
	mediumblue: [0, 0, 205, 1],
	mediumorchid: [186, 85, 211, 1],
	mediumpurple: [147, 112, 219, 1],
	mediumseagreen: [60, 179, 113, 1],
	mediumslateblue: [123, 104, 238, 1],
	mediumspringgreen: [0, 250, 154, 1],
	mediumturquoise: [72, 209, 204, 1],
	mediumvioletred: [199, 21, 133, 1],
	midnightblue: [25, 25, 112, 1],
	mintcream: [245, 255, 250, 1],
	mistyrose: [255, 228, 225, 1],
	moccasin: [255, 228, 181, 1],
	navajowhite: [255, 222, 173, 1],
	navy: [0, 0, 128, 1],
	oldlace: [253, 245, 230, 1],
	olive: [128, 128, 0, 1],
	olivedrab: [107, 142, 35, 1],
	orange: [255, 165, 0, 1],
	orangered: [255, 69, 0, 1],
	orchid: [218, 112, 214, 1],
	palegoldenrod: [238, 232, 170, 1],
	palegreen: [152, 251, 152, 1],
	paleturquoise: [175, 238, 238, 1],
	palevioletred: [219, 112, 147, 1],
	papayawhip: [255, 239, 213, 1],
	peachpuff: [255, 218, 185, 1],
	peru: [205, 133, 63, 1],
	pink: [255, 192, 203, 1],
	plum: [221, 160, 221, 1],
	powderblue: [176, 224, 230, 1],
	purple: [128, 0, 128, 1],
	rosybrown: [188, 143, 143, 1],
	royalblue: [65, 105, 225, 1],
	saddlebrown: [139, 69, 19, 1],
	salmon: [250, 128, 114, 1],
	sandybrown: [244, 164, 96, 1],
	seagreen: [46, 139, 87, 1],
	seashell: [255, 245, 238, 1],
	sienna: [160, 82, 45, 1],
	silver: [192, 192, 192, 1],
	skyblue: [135, 206, 235, 1],
	slateblue: [106, 90, 205, 1],
	slategray: [112, 128, 144, 1],
	slategrey: [112, 128, 144, 1],
	snow: [255, 250, 250, 1],
	springgreen: [0, 255, 127, 1],
	steelblue: [70, 130, 180, 1],
	tan: [210, 180, 140, 1],
	teal: [0, 128, 128, 1],
	thistle: [216, 191, 216, 1],
	tomato: [255, 99, 71, 1],
	turquoise: [64, 224, 208, 1],
	violet: [238, 130, 238, 1],
	wheat: [245, 222, 179, 1],
	whitesmoke: [245, 245, 245, 1],
	yellow: [255, 255, 0, 1],
	yellowgreen: [154, 205, 50, 1],
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

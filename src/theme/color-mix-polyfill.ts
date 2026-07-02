/**
 * Runtime polyfill for CSS `color-mix()` on engines that miscompute it.
 *
 * macOS WKWebView (AppleWebKit/605.1.15, Catalina) does NOT compute color-mix
 * — it returns the first operand, ignoring the percentage and second operand.
 * This makes intended-faint tints render as their (saturated) first color
 * (e.g. a 10% green tint renders solid green, hiding same-color icons).
 *
 * Detection: a probe element tests `color-mix(in srgb, #f00 0%, #00f)` which
 * MUST yield blue; if it yields anything else, color-mix is broken and we run.
 *
 * When broken, this module walks all style rules in document.styleSheets,
 * parses color-mix() values, resolves CSS var() references (recursively;
 * vars whose value is itself a color-mix are resolved when those chains are
 * defined inside stylesheets, which the polyfill reads via getComputedStyle),
 * computes the sRGB mix (with premultiplied alpha so `transparent` is handled
 * correctly), and rewrites the declaration with plain rgb()/rgba(). Original
 * values are preserved so the polyfill can re-run when theme tokens change.
 *
 * LAYERING: this runtime polyfill ONLY rewrites color-mix() that appear inside
 * stylesheet CSSStyleRules. Theme tokens set as inline :root custom properties
 * (via style.setProperty) and consumed BARE through var() aliases in app.css
 * are NOT rewritten here — those are precomputed to plain rgb()/rgba() at apply
 * time by src/theme/semantic-tokens.ts (see `deriveSemanticTokens`). Both layers
 * are required on macOS; do not remove the precompute thinking the polyfill
 * covers everything.
 *
 * Defensive: any rule/value that fails to parse is left untouched. On engines
 * that compute color-mix correctly (Windows/Chromium), the probe passes and the
 * module does nothing.
 */

import { mixColors } from "./color-mix-helpers.js";

/** Read a custom property from :root, resolving one level of var() indirection chain. */
function readRootVar(name: string, maxDepth = 6): string | null {
	const rootStyle = getComputedStyle(document.documentElement);
	let value = rootStyle.getPropertyValue(name).trim();
	if (!value) return null;
	let depth = 0;
	while (depth < maxDepth) {
		const m = /^var\((--[^)]+)\)$/i.exec(value.trim());
		if (!m) break;
		const next = rootStyle.getPropertyValue(m[1].trim()).trim();
		if (!next) break;
		value = next;
		depth++;
	}
	return value || null;
}

/** Resolve a color operand to a concrete color string, handling var() and nested color-mix(). */
function resolveToConcrete(raw: string, depth: number): string | null {
	if (depth > 10) return null;
	const v = raw.trim();
	if (!v) return null;
	const varM = /^var\((--[^)]+)\)$/i.exec(v);
	if (varM) {
		const resolved = readRootVar(varM[1].trim());
		if (resolved === null) return null;
		return resolveToConcrete(resolved, depth + 1);
	}
	if (/^color-mix\(/i.test(v)) {
		const open = v.indexOf("(");
		const close = findMatchingParen(v, open);
		if (close === -1) return null;
		const parsed = parseColorMixInner(v.slice(open + 1, close));
		if (!parsed) return null;
		return computeMix(parsed, depth + 1);
	}
	return v;
}

interface ParsedMix {
	a: string;
	pA: number;
	b: string;
	pB: number;
}

function parseOperand(raw: string): { color: string; pct: number | null } | null {
	const v = raw.trim();
	if (!v) return null;
	const m = /^(.*?)(?:\s+([0-9]+(?:\.[0-9]+)?)%)?$/.exec(v);
	if (!m) return null;
	const color = (m[1] ?? "").trim();
	if (!color) return null;
	const pct = m[2] !== undefined ? parseFloat(m[2]) / 100 : null;
	return { color, pct };
}

/** Parse the inner of `color-mix(in srgb, A [pA%], B [pB%])`. */
function parseColorMixInner(inner: string): ParsedMix | null {
	const parts = splitTopLevel(inner, ",");
	if (parts.length < 3) return null;
	if (!/^\s*in\s+srgb\b/i.test(parts[0])) return null; // only srgb supported
	const a = parseOperand(parts[1]);
	const b = parseOperand(parts.slice(2).join(","));
	if (!a || !b) return null;
	let pA = a.pct;
	let pB = b.pct;
	if (pA === null && pB === null) { pA = 0.5; pB = 0.5; }
	else if (pA === null) { pA = 1 - (pB as number); }
	else if (pB === null) { pB = 1 - pA; }
	if (pA === null || pB === null) return null; // logically unreachable; satisfies the type checker
	const sum = pA + pB;
	if (sum <= 0) return null;
	pA /= sum;
	pB /= sum;
	return { a: a.color, pA, b: b.color, pB };
}

/** Compute a parsed mix by delegating to the shared premultiplied-alpha mixer. */
function computeMix(mix: ParsedMix, depth: number): string | null {
	const aRaw = resolveToConcrete(mix.a, depth);
	const bRaw = resolveToConcrete(mix.b, depth);
	if (aRaw === null || bRaw === null) return null;
	return mixColors(aRaw, mix.pA, bRaw, mix.pB);
}

/** Replace every color-mix(...) in a CSS value string. Returns null if ANY fails (caller keeps original). */
function rewriteValue(value: string): string | null {
	let result = value;
	let i = 0;
	while (i < result.length) {
		const idx = result.indexOf("color-mix(", i);
		if (idx === -1) break;
		const open = result.indexOf("(", idx);
		const close = findMatchingParen(result, open);
		if (close === -1) return null;
		const inner = result.slice(open + 1, close);
		const parsed = parseColorMixInner(inner);
		if (!parsed) return null;
		const computed = computeMix(parsed, 0);
		if (computed === null) return null;
		result = result.slice(0, idx) + computed + result.slice(close + 1);
		i = idx + computed.length;
	}
	return result;
}

function findMatchingParen(s: string, openIdx: number): number {
	let depth = 0;
	for (let i = openIdx; i < s.length; i++) {
		if (s[i] === "(") depth++;
		else if (s[i] === ")") {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function splitTopLevel(s: string, delim: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of s) {
		if (ch === "(") depth++;
		else if (ch === ")") depth = Math.max(0, depth - 1);
		if (depth === 0 && ch === delim) {
			out.push(cur);
			cur = "";
		} else {
			cur += ch;
		}
	}
	out.push(cur);
	return out;
}

/** Probe whether the engine computes color-mix correctly. */
function isColorMixBroken(): boolean {
	try {
		const probe = document.createElement("div");
		probe.style.position = "absolute";
		probe.style.visibility = "hidden";
		probe.style.background = "color-mix(in srgb, #ff0000 0%, #0000ff)";
		document.body.appendChild(probe);
		const bg = getComputedStyle(probe).backgroundColor;
		probe.remove();
		// Correct result is pure blue rgb(0, 0, 255). Anything else = broken.
		return bg !== "rgb(0, 0, 255)";
	} catch {
		return false;
	}
}

const originals = new Map<CSSStyleRule, Record<string, string>>();

function rewriteRules(rules: CSSRuleList): void {
	for (const rule of Array.from(rules)) {
		if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || rule instanceof CSSLayerBlockRule) {
			try {
				rewriteRules(rule.cssRules);
			} catch {
				/* skip */
			}
			continue;
		}
		if (!(rule instanceof CSSStyleRule)) continue;
		const style = rule.style;
		let ruleOriginals: Record<string, string> | undefined = originals.get(rule);
		for (let i = 0; i < style.length; i++) {
			const prop = style.item(i);
			const value = style.getPropertyValue(prop);
			if (!value || !value.includes("color-mix(")) continue;
			if (!ruleOriginals) {
				ruleOriginals = {};
				originals.set(rule, ruleOriginals);
			}
			if (!(prop in ruleOriginals)) ruleOriginals[prop] = value;
			const rewritten = rewriteValue(ruleOriginals[prop]);
			if (rewritten !== null && rewritten !== value) {
				try {
					style.setProperty(prop, rewritten);
				} catch {
					/* skip */
				}
			}
		}
	}
}

function rewriteAllSheets(): void {
	for (const sheet of Array.from(document.styleSheets)) {
		try {
			rewriteRules(sheet.cssRules);
		} catch {
			// cross-origin / inaccessible — skip
		}
	}
}

/** Restore original values (so a re-run resolves against fresh theme tokens). */
function restoreOriginals(): void {
	for (const [rule, orig] of originals) {
		for (const prop in orig) {
			try {
				rule.style.setProperty(prop, orig[prop]);
			} catch {
				/* skip */
			}
		}
	}
}

function rerun(): void {
	restoreOriginals();
	rewriteAllSheets();
}

let installed = false;

/**
 * Install the polyfill. No-op on engines that compute color-mix correctly.
 * Safe to call once after startup; re-runs automatically on theme changes.
 */
export function installColorMixPolyfill(): void {
	if (installed || typeof document === "undefined") return;
	if (!isColorMixBroken()) return;
	installed = true;
	rewriteAllSheets();
	window.addEventListener("pi-desktop:theme-changed", rerun);
	window.addEventListener("pi-desktop:appearance-profile-changed", rerun);
}

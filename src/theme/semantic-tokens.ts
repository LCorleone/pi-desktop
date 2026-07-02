import { mixColors, srgbAlpha, srgbMix } from "./color-mix-helpers.js";
import type { DesktopThemeResolved } from "./theme-manager.js";

export interface DeriveSemanticTokensOptions {
	resolved: DesktopThemeResolved;
	accent?: string;
	background?: string;
	foreground?: string;
	/** Base color the foreground text is mixed toward for secondary/tertiary. Defaults to `background ?? "transparent"`. */
	textMixBase?: string;
	/** Contrast 0-100. When provided, also precomputes `--border` (see `deriveBorderWithoutForeground`). */
	contrast?: number;
	/**
	 * Derive `--border` from `contrast` even when no `foreground` override is
	 * present. The production profile path needs this: stored profiles carry no
	 * foreground, yet `--border` must still scale with the contrast slider
	 * (mixing the theme-default `--color-border-default` token). The live
	 * Settings preview does not — it only restyles borders when a foreground
	 * draft is active. Defaults to false.
	 */
	deriveBorderWithoutForeground?: boolean;
}

function clampContrast(value: number): number {
	if (!Number.isFinite(value)) return 50;
	return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Derive the semantic `--color-*` (and optionally `--border`) custom properties
 * from raw accent/background/foreground colors, matching CSS `color-mix(in srgb,…)`
 * but precomputed to plain rgb()/rgba() so macOS WKWebView 605.1.15 (which drops
 * color-mix) renders them correctly. Each value also has a color-mix() fallback
 * for engines that compute color-mix natively.
 *
 * NOTE: these tokens are consumed BARE via var() aliases in app.css (e.g.
 * `--bg-soft: var(--color-bg-soft)`), which the runtime color-mix polyfill does
 * NOT rewrite (it only rewrites color-mix() inside stylesheet rules). So this
 * precompute layer is load-bearing on macOS — do not remove it.
 */
export function deriveSemanticTokens(opts: DeriveSemanticTokensOptions): Record<string, string> {
	const { resolved, accent, background, foreground } = opts;
	const out: Record<string, string> = {};
	const neutralLift = resolved === "dark" ? "white" : "black";
	const sidebarBase = resolved === "dark" ? 86 : 92;
	const sidebarShade = resolved === "dark" ? 14 : 8;
	const textBase = opts.textMixBase ?? background ?? "transparent";

	// Route through mixColors(c1, p1, c2, p2) — not srgbMix — so the precomputed
	// value and the color-mix() fallback both honor p2 and stay consistent even
	// if a caller passes p1 + p2 != 100. (All current callers sum to 100, so this
	// is behaviorally identical to the old srgbMix(c1, p1, c2) call.)
	const mix = (c1: string, p1: number, c2: string, p2: number): string =>
		mixColors(c1, p1, c2, p2) ?? `color-mix(in srgb, ${c1} ${p1}%, ${c2} ${p2}%)`;

	if (accent) {
		out["--color-accent-primary"] = accent;
		out["--color-accent-soft"] = srgbMix(accent, 20, "transparent") ?? `color-mix(in srgb, ${accent} 20%, transparent)`;
	}
	if (background) {
		out["--color-bg-app"] = background;
		out["--color-bg-elevated"] = mix(background, 94, neutralLift, 6);
		out["--color-bg-muted"] = mix(background, 89, neutralLift, 11);
		out["--color-bg-soft"] = mix(background, 84, neutralLift, 16);
		out["--color-bg-sidebar"] = srgbMix(background, sidebarBase, "black") ?? `color-mix(in srgb, ${background} ${sidebarBase}%, black ${sidebarShade}%)`;
		out["--color-bg-workspace-chrome"] = mix(background, 92, neutralLift, 8);
		out["--color-bg-workspace-chrome-soft"] = mix(background, 86, neutralLift, 14);
	}
	if (foreground) {
		out["--color-text-primary"] = foreground;
		out["--color-text-secondary"] = mix(foreground, 68, textBase, 32);
		out["--color-text-tertiary"] = mix(foreground, 52, textBase, 48);
		out["--color-border-default"] = srgbMix(foreground, 12, "transparent") ?? `color-mix(in srgb, ${foreground} 12%, transparent)`;
	}
	// --border scales with contrast independently of a foreground override: when
	// foreground is absent it mixes the (theme-default) --color-border-default.
	if (opts.contrast !== undefined && (foreground || opts.deriveBorderWithoutForeground)) {
		const borderMix = 40 + Math.round((clampContrast(opts.contrast) / 100) * 60);
		out["--border"] = foreground
			? (srgbAlpha(foreground, 0.12 * (borderMix / 100)) ?? `color-mix(in srgb, var(--color-border-default) ${borderMix}%, transparent)`)
			: `color-mix(in srgb, var(--color-border-default) ${borderMix}%, transparent)`;
	}
	return out;
}

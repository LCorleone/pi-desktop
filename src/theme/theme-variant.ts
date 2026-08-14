/**
 * Shared light/dark variant classification for Pi theme documents.
 *
 * Both the settings panel and the packages view scan `~/.pi/agent/themes`
 * and need to classify each theme file identically. This module is the one
 * canonical implementation: explicit `piDesktop.variant` metadata always
 * wins over inference, then background luminance, then file-name hints.
 */

export type PiThemeVariant = "light" | "dark";

const DEFAULT_THEME_BACKGROUND = "#101010";
const LIGHT_VARIANT_LUMINANCE_THRESHOLD = 0.42;

function xtermIndexToHex(index: number): string | null {
	if (!Number.isInteger(index) || index < 0 || index > 255) return null;
	const hex = (value: number): string => value.toString(16).padStart(2, "0");
	const levels = [0, 95, 135, 175, 215, 255] as const;
	if (index < 16) {
		const ansi = [
			"#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
			"#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
		] as const;
		return ansi[index] ?? null;
	}
	if (index <= 231) {
		const value = index - 16;
		const r = Math.floor(value / 36);
		const g = Math.floor((value % 36) / 6);
		const b = value % 6;
		return `#${hex(levels[r] ?? 0)}${hex(levels[g] ?? 0)}${hex(levels[b] ?? 0)}`;
	}
	const gray = 8 + (index - 232) * 10;
	return `#${hex(gray)}${hex(gray)}${hex(gray)}`;
}

function normalizeColorLiteral(value: unknown): string | null {
	if (typeof value === "number") return xtermIndexToHex(value);
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^#([0-9a-f]{3,8})$/i.test(trimmed)) return trimmed;
	if (/^\d{1,3}$/.test(trimmed)) return xtermIndexToHex(Number(trimmed));
	return null;
}

function resolveThemeColorValue(theme: Record<string, unknown>, value: unknown, seen = new Set<string>()): string | null {
	const direct = normalizeColorLiteral(value);
	if (direct) return direct;
	if (typeof value !== "string") return null;
	const ref = value.trim();
	if (!ref || seen.has(ref)) return null;
	seen.add(ref);
	const vars = (theme.vars as Record<string, unknown> | undefined) ?? {};
	if (Object.prototype.hasOwnProperty.call(vars, ref)) {
		const fromVar = resolveThemeColorValue(theme, vars[ref], seen);
		if (fromVar) return fromVar;
	}
	const colors = (theme.colors as Record<string, unknown> | undefined) ?? {};
	if (Object.prototype.hasOwnProperty.call(colors, ref)) {
		const fromColor = resolveThemeColorValue(theme, colors[ref], seen);
		if (fromColor) return fromColor;
	}
	return null;
}

function themeBackgroundColor(theme: Record<string, unknown>): string {
	const colors = (theme.colors as Record<string, unknown> | undefined) ?? {};
	return (
		resolveThemeColorValue(theme, colors.selectedBg) ??
		resolveThemeColorValue(theme, colors.userMessageBg) ??
		resolveThemeColorValue(theme, colors.customMessageBg) ??
		DEFAULT_THEME_BACKGROUND
	);
}

function parseColorRgb(color: string): { r: number; g: number; b: number } | null {
	const trimmed = color.trim();
	const short = trimmed.match(/^#([0-9a-f]{3})$/i);
	if (short) {
		const [r, g, b] = short[1].split("");
		return {
			r: parseInt(`${r}${r}`, 16),
			g: parseInt(`${g}${g}`, 16),
			b: parseInt(`${b}${b}`, 16),
		};
	}
	const full = trimmed.match(/^#([0-9a-f]{6})$/i);
	if (full) {
		return {
			r: parseInt(full[1].slice(0, 2), 16),
			g: parseInt(full[1].slice(2, 4), 16),
			b: parseInt(full[1].slice(4, 6), 16),
		};
	}
	const rgb = trimmed.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
	if (rgb) {
		return {
			r: Math.max(0, Math.min(255, Number(rgb[1]))),
			g: Math.max(0, Math.min(255, Number(rgb[2]))),
			b: Math.max(0, Math.min(255, Number(rgb[3]))),
		};
	}
	return null;
}

function colorLuminance(color: string): number | null {
	const rgb = parseColorRgb(color);
	if (!rgb) return null;
	const toLinear = (channel: number): number => {
		const s = channel / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	const r = toLinear(rgb.r);
	const g = toLinear(rgb.g);
	const b = toLinear(rgb.b);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function inferVariantFromBackground(background: string): PiThemeVariant | null {
	const luminance = colorLuminance(background);
	if (luminance === null) return null;
	return luminance >= LIGHT_VARIANT_LUMINANCE_THRESHOLD ? "light" : "dark";
}

/**
 * Classify a parsed theme document as light or dark.
 *
 * Order of precedence:
 * 1. Explicit `piDesktop.variant` metadata (always wins over inference).
 * 2. Luminance of the theme's resolved background color
 *    (`colors.selectedBg` -> `colors.userMessageBg` -> `colors.customMessageBg`).
 * 3. `-light` / `-dark` suffix hints in the theme id.
 * 4. Luminance of `fallbackBackground` (when provided by the caller),
 *    otherwise the theme's background with a dark default.
 * 5. `light` substring in the id, else dark.
 */
export function inferThemeVariant(theme: Record<string, unknown>, id: string, fallbackBackground?: string): PiThemeVariant {
	const meta = theme.piDesktop;
	if (meta && typeof meta === "object" && !Array.isArray(meta)) {
		const variant = (meta as Record<string, unknown>).variant;
		if (variant === "light" || variant === "dark") return variant;
	}

	const colors = (theme.colors as Record<string, unknown> | undefined) ?? {};
	const directBackground =
		resolveThemeColorValue(theme, colors.selectedBg) ??
		resolveThemeColorValue(theme, colors.userMessageBg) ??
		resolveThemeColorValue(theme, colors.customMessageBg) ??
		null;
	if (directBackground) {
		const byDirectBackground = inferVariantFromBackground(directBackground);
		if (byDirectBackground) return byDirectBackground;
	}

	const normalizedId = id.toLowerCase();
	if (normalizedId.includes("-light")) return "light";
	if (normalizedId.includes("-dark")) return "dark";

	const fromBackground = inferVariantFromBackground(fallbackBackground ?? themeBackgroundColor(theme));
	if (fromBackground) return fromBackground;

	return normalizedId.includes("light") ? "light" : "dark";
}

/**
 * Safe markdown rendering.
 *
 * Wraps @mariozechner/mini-lit's <markdown-block>, which pipes markdown
 * through marked into unsafeHTML. The bundled component (0.2.1) escapes
 * literal HTML tags but passes markdown link/image syntax through untouched,
 * so `[x](javascript:alert(1))` renders as a live javascript: anchor.
 * <safe-markdown-block> neutralises those URLs after each render.
 */

import { MarkdownBlock } from "@mariozechner/mini-lit/dist/MarkdownBlock.js";
import { customElement } from "lit/decorators.js";
import type { PropertyValues } from "lit";

/** URL schemes permitted in markdown-rendered link/media targets. */
const SAFE_URL_SCHEME = /^(?:https?|mailto):/i;
/** Matches any scheme prefix, used to detect scheme-less relative URLs. */
const ANY_URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Returns true when a rendered URL is safe to keep: http/https/mailto,
 * in-page fragments, and plain relative paths. Mirrors how browsers strip
 * control characters before resolving a URL so e.g. `java\tscript:` or
 * `javascript&#58;`-style obfuscation cannot sneak a scheme past the check.
 */
export function isSafeMarkdownUrl(value: string): boolean {
	const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
	if (normalized === "" || normalized.startsWith("#")) return true;
	if (SAFE_URL_SCHEME.test(normalized)) return true;
	// Reject anything else that carries a scheme (javascript:, vbscript:,
	// data:, file:, ...); scheme-less relative URLs are harmless.
	return !ANY_URL_SCHEME.test(normalized);
}

export function sanitizeRenderedMarkdown(root: HTMLElement): void {
	root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
		if (!isSafeMarkdownUrl(link.getAttribute("href") ?? "")) {
			link.removeAttribute("href");
			link.removeAttribute("target");
		}
	});
	root.querySelectorAll<HTMLIFrameElement>("iframe[src]").forEach((frame) => {
		if (!isSafeMarkdownUrl(frame.getAttribute("src") ?? "")) {
			frame.removeAttribute("src");
		}
	});
	root.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
		if (!isSafeMarkdownUrl(image.getAttribute("src") ?? "")) {
			image.removeAttribute("src");
		}
	});
	root.querySelectorAll<HTMLFormElement>("form[action]").forEach((form) => {
		if (!isSafeMarkdownUrl(form.getAttribute("action") ?? "")) {
			form.removeAttribute("action");
		}
	});
}

@customElement("safe-markdown-block")
export class SafeMarkdownBlock extends MarkdownBlock {
	protected override updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties);
		// MarkdownBlock renders into light DOM (createRenderRoot returns this),
		// so the markup just committed by unsafeHTML is queryable on the host.
		sanitizeRenderedMarkdown(this);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"safe-markdown-block": SafeMarkdownBlock;
	}
}

/**
 * Window chrome — platform detection and window state reflected on <html>.
 *
 * Centralises caption-button rendering and maximised-state tracking so the
 * sidebar (and any future chrome) share one source of truth. CSS keys off
 * [data-os] and [data-maximized] on the root element.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { html, type TemplateResult } from "lit";

export type Platform = "windows" | "mac" | "linux";

function detectPlatform(): Platform {
	const ua = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
	if (ua.includes("win")) return "windows";
	if (ua.includes("mac")) return "mac";
	return "linux";
}

const platform: Platform = detectPlatform();
let maximized = false;
const listeners = new Set<(maximized: boolean) => void>();
let tracking = false;

function setMaximized(next: boolean): void {
	if (next === maximized) return;
	maximized = next;
	document.documentElement.dataset.maximized = maximized ? "true" : "false";
	for (const cb of listeners) cb(maximized);
}

async function trackMaximized(): Promise<void> {
	if (tracking) return;
	tracking = true;
	try {
		const win = getCurrentWindow();
		setMaximized(await win.isMaximized());
		await win.onResized(() => {
			void win.isMaximized().then(setMaximized);
		});
	} catch {
		// non-tauri runtime — no native window state to track
	}
}

export function isWindows(): boolean {
	return platform === "windows";
}

/** Write platform + start maximised-state tracking. Call once at bootstrap. */
export function applyWindowChrome(): void {
	document.documentElement.dataset.os = platform;
	void trackMaximized();
}

export function getMaximized(): boolean {
	return maximized;
}

/** Subscribe to maximised-state changes. Returns an unsubscribe function. */
export function subscribeMaximized(cb: (maximized: boolean) => void): () => void {
	listeners.add(cb);
	void trackMaximized();
	return () => {
		listeners.delete(cb);
	};
}

export type CaptionIcon = "minimize" | "maximize" | "restore" | "close";

/** Inline SVG for a Windows-style caption button. */
export function captionIconSvg(kind: CaptionIcon): TemplateResult {
	switch (kind) {
		case "minimize":
			return html`<svg class="win-ctrl-svg" viewBox="0 0 10 10" aria-hidden="true"><path d="M0.6 5h8.8" /></svg>`;
		case "maximize":
			return html`<svg class="win-ctrl-svg" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.2 1.2h7.6v7.6h-7.6z" /></svg>`;
		case "restore":
			return html`<svg class="win-ctrl-svg" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.8 1.2h6v6" /><path d="M1.2 3.6h6v5.2h-6z" /></svg>`;
		case "close":
			return html`<svg class="win-ctrl-svg" viewBox="0 0 10 10" aria-hidden="true"><path d="M0.8 0.8l8.4 8.4M9.2 0.8l-8.4 8.4" /></svg>`;
	}
}

/**
 * TerminalPanel - docked terminal experience backed by a real PTY.
 *
 * A persistent login shell runs inside a pseudo-terminal (see src-tauri/src/pty.rs).
 * xterm.js renders output and forwards keystrokes verbatim to the PTY. The shell
 * owns its own prompt, line editing, history, cwd, and job control — the host
 * only transports bytes and manages the session lifecycle.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { html, render } from "lit";

interface TerminalExecResult {
	code: number | null;
	signal: number | null;
	stdout: string;
	stderr: string;
}

interface TerminalCommandCompleteEvent {
	command: string;
	interactive: boolean;
	result: TerminalExecResult | null;
}

interface PtyDataEvent {
	id: string;
	data: string;
	generation: number;
}

interface PtyExitEvent {
	id: string;
	generation: number;
	exit_code: number | null;
}

function compactPath(path: string | null): string {
	if (!path) return "~";
	const normalized = path.replace(/\\/g, "/");
	const globalHome = (globalThis as { __PI_HOME__?: string }).__PI_HOME__;
	const home = (typeof globalHome === "string" ? globalHome : "").replace(/\\/g, "/").replace(/\/+$/, "");
	if (home && normalized.startsWith(home)) {
		const suffix = normalized.slice(home.length).replace(/^\//, "");
		return suffix ? `~/${suffix}` : "~";
	}
	return normalized;
}

/** Decode a base64 string into a Uint8Array (binary-safe PTY output transport). */
function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export class TerminalPanel {
	private container: HTMLElement;
	private cwd: string | null = null;
	private onRequestClose: (() => void) | null = null;
	private onCommandComplete: ((event: TerminalCommandCompleteEvent) => void | Promise<void>) | null = null;

	private xterm: Terminal | null = null;
	private fitAddon: FitAddon | null = null;
	private resizeObserver: ResizeObserver | null = null;

	private readonly ptyId: string;
	private ptySpawned = false;
	private currentGeneration = 0;
	private spawnedCwd: string | null = null;
	private spawnInFlight: Promise<void> | null = null;
	private unlistenData: UnlistenFn | null = null;
	private unlistenExit: UnlistenFn | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
		this.ptyId = `terminal-${Math.random().toString(36).slice(2, 10)}`;
		this.render();
	}

	setOnRequestClose(cb: () => void): void {
		this.onRequestClose = cb;
	}

	setOnCommandComplete(cb: (event: TerminalCommandCompleteEvent) => void | Promise<void>): void {
		this.onCommandComplete = cb;
	}

	setProjectPath(path: string | null): void {
		const next = path && path.trim().length > 0 ? path : null;
		const previous = this.cwd;
		this.cwd = next;
		this.render();
		// If a shell is already running and the working directory changed (e.g.
		// switching workspaces), restart the shell in the new cwd so each
		// workspace owns an independent session.
		if (this.ptySpawned && next !== previous) {
			void this.respawn();
		}
	}

	focusInput(): void {
		this.xterm?.focus();
	}

	/** Run a command from an external trigger (e.g. command palette / chat).
	 * The command is typed into the persistent shell followed by Enter. */
	async runCommand(commandText: string): Promise<void> {
		const command = commandText.trim();
		if (!command) return;
		this.ensureTerminal();
		await this.ensurePty();
		this.focusInput();
		await this.writeToPty(`${command}\r`);
		// The persistent shell owns command execution, so we cannot observe a
		// structured exit code here. Notify with result=null so downstream
		// refresh hooks (auth/command refresh) still fire for pi commands.
		if (this.onCommandComplete) {
			void Promise.resolve(
				this.onCommandComplete({ command, interactive: false, result: null }),
			).catch(() => {
				// Ignore command completion callback failures.
			});
		}
	}

	private applyTheme(): void {
		if (!this.xterm) return;
		const styles = getComputedStyle(document.documentElement);
		const panelRoot = this.container.querySelector<HTMLElement>(".terminal-panel-root");
		const panelStyles = panelRoot ? getComputedStyle(panelRoot) : styles;
		const background = panelStyles.getPropertyValue("--terminal-panel-bg").trim() || styles.getPropertyValue("--bg").trim() || "#0f1115";
		const foreground = styles.getPropertyValue("--text").trim() || "#d7dce2";
		const muted = styles.getPropertyValue("--muted").trim() || "#95a1b2";
		const accent = styles.getPropertyValue("--accent").trim() || foreground;
		this.xterm.options.theme = {
			background,
			foreground,
			cursor: accent,
			cursorAccent: background,
			selectionBackground: muted,
		};
	}

	private ensureTerminal(): void {
		const viewport = this.container.querySelector<HTMLElement>("#terminal-viewport");
		if (!viewport) return;

		if (!this.xterm) {
			this.fitAddon = new FitAddon();
			this.xterm = new Terminal({
				cursorBlink: true,
				cursorStyle: "bar",
				cursorWidth: 2,
				convertEol: false,
				scrollback: 6000,
				fontSize: 12,
				lineHeight: 1.35,
				fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace",
			});
			this.xterm.loadAddon(this.fitAddon);
			this.applyTheme();
			this.xterm.open(viewport);
			this.fitAddon.fit();

			// Keystrokes flow straight into the PTY.
			this.xterm.onData((data) => {
				void this.writeToPty(data);
			});
			// Keep the PTY size in sync with the viewport.
			this.xterm.onResize(({ cols, rows }) => {
				if (this.ptySpawned) {
					void invoke("pty_resize", { id: this.ptyId, cols, rows }).catch(() => {
						// Ignore resize errors while spawning/tearing down.
					});
				}
			});
			// Handle host-level shortcuts (copy/paste/select-all) before they
			// reach the PTY; everything else is passed through to the shell.
			this.xterm.attachCustomKeyEventHandler((event) => this.handleKey(event));
		}

		if (!this.resizeObserver) {
			this.resizeObserver = new ResizeObserver(() => {
				this.fitAddon?.fit();
			});
			this.resizeObserver.observe(viewport);
		}
	}

	private async ensurePty(): Promise<void> {
		if (this.ptySpawned) return;
		if (this.spawnInFlight) return this.spawnInFlight;
		const attempt = (async () => {
			await this.installListeners();
			const { cols, rows } = this.getDimensions();
			try {
				this.currentGeneration = await invoke<number>("pty_spawn", {
					options: { cwd: this.cwd || ".", cols, rows },
					id: this.ptyId,
				});
				this.ptySpawned = true;
				this.spawnedCwd = this.cwd;
			} catch (err) {
				this.xterm?.writeln(
					`\x1b[31mFailed to start shell: ${err instanceof Error ? err.message : String(err)}\x1b[0m`,
				);
				throw err;
			}
		})();
		this.spawnInFlight = attempt;
		try {
			await attempt;
		} finally {
			this.spawnInFlight = null;
		}
	}

	private async respawn(): Promise<void> {
		// The backend pty_spawn supersedes an existing session under the same id
		// (kills the old child). Reset the viewport and re-spawn in the new cwd.
		try {
			const { cols, rows } = this.getDimensions();
			this.ptySpawned = false;
			this.currentGeneration = await invoke<number>("pty_spawn", {
				options: { cwd: this.cwd || ".", cols, rows },
				id: this.ptyId,
			});
			this.ptySpawned = true;
			this.spawnedCwd = this.cwd;
			this.xterm?.reset();
		} catch (err) {
			this.xterm?.writeln(
				`\x1b[31mFailed to start shell: ${err instanceof Error ? err.message : String(err)}\x1b[0m`,
			);
		}
	}

	private async installListeners(): Promise<void> {
		const id = this.ptyId;
		if (!this.unlistenData) {
			this.unlistenData = await listen<PtyDataEvent>("pty-data", (event) => {
				if (event.payload.id !== id) return;
				if (event.payload.generation !== this.currentGeneration) return;
				const bytes = base64ToBytes(event.payload.data);
				this.xterm?.write(bytes);
				this.scrollTerminalToBottom();
			});
		}
		if (!this.unlistenExit) {
			this.unlistenExit = await listen<PtyExitEvent>("pty-exit", (event) => {
				if (event.payload.id !== id) return;
				if (event.payload.generation !== this.currentGeneration) return;
				this.handlePtyExit();
			});
		}
	}

	private handlePtyExit(): void {
		this.ptySpawned = false;
		this.spawnedCwd = null;
		this.xterm?.write("\r\n\x1b[90m[shell exited — type to start a new session]\x1b[0m\r\n");
	}

	private async writeToPty(data: string): Promise<void> {
		if (!data) return;
		await this.ensurePty();
		await invoke("pty_write", { id: this.ptyId, data }).catch(() => {
			// Ignore write errors while the session is starting/ending.
		});
	}

	private getDimensions(): { cols: number; rows: number } {
		return {
			cols: Math.max(20, Math.floor(this.xterm?.cols ?? 80)),
			rows: Math.max(5, Math.floor(this.xterm?.rows ?? 24)),
		};
	}

	private scrollTerminalToBottom(): void {
		requestAnimationFrame(() => {
			this.xterm?.scrollToBottom();
		});
	}

	// --- Clipboard / host shortcuts ---

	private isMacPlatform(): boolean {
		return navigator.platform.toLowerCase().includes("mac");
	}

	private isCopyShortcut(event: KeyboardEvent): boolean {
		const key = event.key.toLowerCase();
		if (this.isMacPlatform()) {
			return event.metaKey && !event.ctrlKey && !event.altKey && key === "c";
		}
		return event.ctrlKey && event.shiftKey && !event.metaKey && key === "c";
	}

	private isPasteShortcut(event: KeyboardEvent): boolean {
		const key = event.key.toLowerCase();
		if (this.isMacPlatform()) {
			return event.metaKey && !event.ctrlKey && !event.altKey && key === "v";
		}
		if (event.ctrlKey && event.shiftKey && !event.metaKey && key === "v") return true;
		return event.shiftKey && key === "insert";
	}

	private isSelectAllShortcut(event: KeyboardEvent): boolean {
		const key = event.key.toLowerCase();
		if (this.isMacPlatform()) {
			return event.metaKey && !event.ctrlKey && !event.altKey && key === "a";
		}
		return event.ctrlKey && event.shiftKey && !event.metaKey && key === "a";
	}

	private async copySelectionToClipboard(): Promise<void> {
		const selection = this.xterm?.getSelection() ?? "";
		if (!selection) return;
		try {
			await navigator.clipboard.writeText(selection);
		} catch {
			// Ignore clipboard failures in restricted environments.
		}
	}

	private handlePastedText(rawText: string): void {
		if (!rawText) return;
		const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		if (!normalized) return;
		void this.writeToPty(normalized);
	}

	private async pasteFromClipboard(): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			this.handlePastedText(text);
		} catch {
			// Ignore clipboard failures in restricted environments.
		}
	}

	/** xterm custom key handler: intercept host shortcuts, pass everything else
	 * through to the shell via onData. xterm selections are not DOM selections,
	 * so copy/paste must use the async Clipboard API actively. */
	private handleKey(event: KeyboardEvent): boolean {
		if (this.isCopyShortcut(event)) {
			void this.copySelectionToClipboard();
			return false;
		}
		if (this.isPasteShortcut(event)) {
			void this.pasteFromClipboard();
			return false;
		}
		if (this.isSelectAllShortcut(event)) {
			this.xterm?.selectAll();
			return false;
		}
		return true;
	}

	private async handleClearAction(): Promise<void> {
		// Send Ctrl-L to the shell so it clears and redraws its prompt.
		if (this.ptySpawned) {
			await this.writeToPty("\x0c");
		}
		this.xterm?.focus();
	}

	render(): void {
		const cwdLabel = this.cwd ? compactPath(this.cwd) : "No project open";
		const template = html`
			<div
				class="terminal-panel-root"
				@mousedown=${(event: MouseEvent) => {
					const target = event.target instanceof Element ? event.target : null;
					if (target?.closest(".terminal-resize-handle")) return;
					this.xterm?.focus();
				}}
			>
				<div class="terminal-resize-handle" title="Resize terminal" aria-hidden="true"></div>
				<div class="terminal-panel-header">
					<div class="terminal-panel-title">Terminal</div>
					<div class="terminal-panel-cwd" title=${this.cwd || ""}>${cwdLabel}</div>
					<div class="terminal-panel-actions">
						<button class="ghost-btn" title="Clear terminal" @click=${() => void this.handleClearAction()}>Clear</button>
						<button class="ghost-btn terminal-close-btn" title="Close terminal" @click=${() => this.onRequestClose?.()}>✕</button>
					</div>
				</div>
				<div id="terminal-viewport" class="terminal-panel-viewport"></div>
			</div>
		`;

		render(template, this.container);
		this.ensureTerminal();
		this.applyTheme();
		this.fitAddon?.fit();
	}
}

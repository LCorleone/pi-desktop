/**
 * TitleBar - custom native-like frame with quick controls + live stats
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { html, nothing, render } from "lit";
import { type CliUpdateStatus, type RpcSessionState, rpcBridge } from "../rpc/bridge.js";
import { getConnectionMode, getSshTargetLabel } from "../connection-state.js";

interface SessionStats {
	tokens: { total?: number };
	cost?: number;
}

export class TitleBar {
	private container: HTMLElement;
	private state: RpcSessionState | null = null;
	private currentProject: string | null = null;
	private isMaximized = false;
	private stats: SessionStats | null = null;
	private statsTimer: ReturnType<typeof setInterval> | null = null;
	private cliStatus: CliUpdateStatus | null = null;
	private cliUpdating = false;

	private onNewSession: (() => void) | null = null;
	private onOpenSessions: (() => void) | null = null;
	private onOpenCommandPalette: (() => void) | null = null;
	private onOpenSettings: (() => void) | null = null;
	private onUpdateCli: (() => void) | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
		void this.checkMaximized();
		void this.refreshStats();
		this.startStatsRefresh();
		this.render();
	}

	updateState(state: RpcSessionState): void {
		this.state = state;
		void this.refreshStats();
		this.render();
	}

	setProject(project: string | null): void {
		this.currentProject = project;
		this.render();
	}

	setOnNewSession(cb: () => void): void {
		this.onNewSession = cb;
	}

	setOnOpenSessions(cb: () => void): void {
		this.onOpenSessions = cb;
	}

	setOnOpenCommandPalette(cb: () => void): void {
		this.onOpenCommandPalette = cb;
	}

	setOnOpenSettings(cb: () => void): void {
		this.onOpenSettings = cb;
	}

	setOnUpdateCli(cb: () => void): void {
		this.onUpdateCli = cb;
	}

	setCliUpdateStatus(status: CliUpdateStatus | null): void {
		this.cliStatus = status;
		this.render();
	}

	setCliUpdating(updating: boolean): void {
		this.cliUpdating = updating;
		this.render();
	}

	private startStatsRefresh(): void {
		this.stopStatsRefresh();
		this.statsTimer = setInterval(() => {
			void this.refreshStats();
		}, 8000);
	}

	private stopStatsRefresh(): void {
		if (!this.statsTimer) return;
		clearInterval(this.statsTimer);
		this.statsTimer = null;
	}

	private async refreshStats(): Promise<void> {
		try {
			const raw = await rpcBridge.getSessionStats();
			this.stats = {
				tokens: (raw.tokens as SessionStats["tokens"]) ?? {},
				cost: typeof raw.cost === "number" ? raw.cost : 0,
			};
			this.render();
		} catch {
			// not critical
		}
	}

	private async checkMaximized(): Promise<void> {
		try {
			this.isMaximized = await getCurrentWindow().isMaximized();
			this.render();
		} catch {
			// ignore (browser fallback)
		}
	}

	private async minimize(): Promise<void> {
		try {
			await getCurrentWindow().minimize();
		} catch {
			/* noop */
		}
	}

	private async toggleMaximize(): Promise<void> {
		try {
			const win = getCurrentWindow();
			if (this.isMaximized) await win.unmaximize();
			else await win.maximize();
			this.isMaximized = !this.isMaximized;
			this.render();
		} catch {
			/* noop */
		}
	}

	private async close(): Promise<void> {
		try {
			await getCurrentWindow().close();
		} catch {
			/* noop */
		}
	}

	private formatTokens(value: number | undefined): string {
		if (!value || value <= 0) return "0";
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
		if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
		return String(value);
	}

	private formatCost(value: number | undefined): string {
		if (!value || value <= 0) return "$0";
		if (value < 0.01) return `$${value.toFixed(4)}`;
		return `$${value.toFixed(2)}`;
	}

	destroy(): void {
		this.stopStatsRefresh();
	}

	render(): void {
		const modelId = this.state?.model?.id || "No model";
		const thinkingLevel = this.state?.thinkingLevel;
		const tokens = this.formatTokens(this.stats?.tokens?.total);
		const cost = this.formatCost(this.stats?.cost);
		const pending = this.state?.pendingMessageCount ?? 0;
		const updateAvailable = Boolean(this.cliStatus?.update_available);
		const canUpdateInApp = Boolean(this.cliStatus?.can_update_in_app && this.cliStatus?.npm_available);
		const updateTitle = this.cliStatus
			? `CLI ${this.cliStatus.current_version || "unknown"} → ${this.cliStatus.latest_version || "latest"}`
			: "CLI update status";

		const template = html`
			<div class="titlebar" data-tauri-drag-region>
				<div class="titlebar-left" data-tauri-drag-region>
					<span class="titlebar-app">pi</span>
					${this.currentProject ? html`<span class="titlebar-sep">/</span><span class="titlebar-project">${this.currentProject}</span>` : nothing}
				</div>

			<div class="titlebar-center" data-tauri-drag-region>
				${getConnectionMode() === "ssh"
					? html`<span class="titlebar-pill remote" title="Connected to a remote pi over SSH"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1"></path><path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1"></path></svg>Remote: ${getSshTargetLabel() ?? "SSH"}</span>`
					: nothing}
				<span class="titlebar-model" title=${modelId}>${modelId}</span>
					${thinkingLevel && thinkingLevel !== "off"
						? html`<span class="titlebar-pill thinking">${thinkingLevel}</span>`
						: nothing}
					${pending > 0 ? html`<span class="titlebar-pill queue">${pending} queued</span>` : nothing}
					<span class="titlebar-meta">${tokens} tok · ${cost}</span>
				</div>

				<div class="titlebar-right">
					<button class="titlebar-action" @click=${() => this.onNewSession?.()} title="New session">New</button>
					<button class="titlebar-action" @click=${() => this.onOpenSessions?.()} title="Sessions">Sessions</button>
					<button class="titlebar-action" @click=${() => this.onOpenCommandPalette?.()} title="Commands">⌘K</button>
					${updateAvailable
						? html`
							<button
								class="titlebar-action update"
								?disabled=${this.cliUpdating || getConnectionMode() === "ssh"}
								@click=${() => {
									if (getConnectionMode() === "ssh") { this.onOpenSettings?.(); return; }
									if (canUpdateInApp) this.onUpdateCli?.();
									else this.onOpenSettings?.();
								}}
								title=${updateTitle}
							>
								${this.cliUpdating ? "Updating…" : canUpdateInApp ? "Update CLI" : "CLI Update"}
							</button>
						`
						: nothing}
					<button class="titlebar-action" @click=${() => this.onOpenSettings?.()} title="Settings">⚙</button>

					<button class="titlebar-window" @click=${() => this.minimize()} title="Minimize">—</button>
					<button class="titlebar-window" @click=${() => this.toggleMaximize()} title=${this.isMaximized ? "Restore" : "Maximize"}>
						${this.isMaximized ? "❐" : "□"}
					</button>
					<button class="titlebar-window close" @click=${() => this.close()} title="Close">✕</button>
				</div>
			</div>
		`;
		render(template, this.container);
	}
}

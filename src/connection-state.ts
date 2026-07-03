/**
 * Connection state — leaf module for the active pi connection mode.
 *
 * This module is intentionally dependency-free (it only imports a type from
 * the RPC bridge) so it can be safely imported by any UI component without
 * risking a circular import with main.ts. main.ts re-exports the accessors.
 *
 * The connection mode is global and app-wide in v1: "local" spawns a local pi
 * child process; "ssh" connects to a pi process running on a remote host over
 * ssh. Surfaces that only work against the local machine are feature-gated on
 * `getConnectionMode() === "ssh"` (see the SSH-mode notices across the UI).
 */

import type { SshConnectionConfig } from "./rpc/bridge.js";

export type ConnectionMode = "local" | "ssh";

let connectionMode: ConnectionMode = "local";
let sshConfig: SshConnectionConfig | null = null;

/** The active connection mode (local or ssh). */
export function getConnectionMode(): ConnectionMode {
	return connectionMode;
}

/**
 * A short "user@host:port" label for the active SSH connection, or null when
 * in local mode (or SSH mode with no host configured). Port is omitted when it
 * is the default. Used for the remote indicator badge.
 */
export function getSshTargetLabel(): string | null {
	if (connectionMode !== "ssh" || !sshConfig?.host) return null;
	const user = sshConfig.user ? `${sshConfig.user}@` : "";
	const port = sshConfig.port ? `:${sshConfig.port}` : "";
	return `${user}${sshConfig.host}${port}`;
}

/** The raw SSH config, or null in local mode. */
export function getSshConfig(): SshConnectionConfig | null {
	return sshConfig;
}

/**
 * Set the active connection state. Called by main.ts after loading settings
 * and whenever the user saves a new connection config (which requires a
 * /reload to take effect on active runtimes).
 */
export function setConnectionState(mode: ConnectionMode, ssh: SshConnectionConfig | null): void {
	connectionMode = mode;
	sshConfig = ssh;
}

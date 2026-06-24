/**
 * Valut — local secret reference system for in-chat credential safety.
 *
 * When a user wraps sensitive text with ``?/`` ... ``/?`` in a chat
 * message, the enclosed value is extracted, stored in ~/.hermes/valut.json
 * (0600 permissions), and replaced with an opaque reference like
 * ``[VLT:vlt_a1b2c3d4]``.  The LLM never sees the plaintext.
 *
 * On output, ``[VLT:<id>]`` references are substituted back to the
 * original value before the user sees them, so the agent can reference
 * a secret by its ID without ever knowing the actual value.
 *
 * Architecture:
 * - Rust backend: persists to ~/.hermes/valut.json with 0600 perms
 * - Frontend cache: in-memory map for synchronous restoreOutput()
 * - Write-through: sanitizeInput() writes to both cache and backend
 *
 * @module security/valut
 */

// ── regex ────────────────────────────────────────────────────────────────
/** Matches ``?/`` opener, any content (non-greedy), ``/?`` closer. */
const TRIGGER_RE = /\/\?\/(.+?)\/\?\//g;  // user types: ?/secret/?

/** Matches ``[VLT:<id>]`` where <id> is ``vlt_`` + 8 hex chars. */
const REF_RE = /\[VLT:(vlt_[0-9a-fA-F]{8})\]/g;

// ── in-memory cache ──────────────────────────────────────────────────────
let cache: Record<string, string> | null = null;

async function ensureCache(): Promise<Record<string, string>> {
	if (cache) return cache;
	cache = {};
	try {
		// Load existing entries from the Rust backend.
		const { invoke } = await import("@tauri-apps/api/core");
		const ids: string[] = await invoke("valut_list");
		for (const id of ids) {
			const val: string | null = await invoke("valut_resolve", { id });
			if (val !== null) cache[id] = val;
		}
	} catch {
		// Backend unavailable — use empty cache (e.g. running in browser dev server).
	}
	return cache;
}

function cacheGet(id: string): string | undefined {
	return cache?.[id];
}

// ── public API ───────────────────────────────────────────────────────────

/**
 * Scan *text* for ``?/.../?`` patterns, vault the secrets via the
 * Rust backend, and return cleaned text with ``[VLT:id]`` references.
 *
 * SAFETY: The returned text contains no plaintext secrets — only
 * opaque references that the agent and LLM can pass around.
 *
 * @param text - User input to sanitize.
 * @returns Sanitized text suitable for sending to the agent.
 */
export async function sanitizeInput(text: string): Promise<string> {
	if (!text || text.indexOf("?/") === -1) return text;

	const store = await ensureCache();

	const result = text.replace(TRIGGER_RE, (_fullMatch: string, secret: string): string => {
		if (!secret.trim()) return _fullMatch; // empty trigger → pass through

		// Reuse existing ID from cache for the same value.
		for (const [id, val] of Object.entries(store)) {
			if (val === secret) return `[VLT:${id}]`;
		}

		// Defer: will be stored via backend below.
		return _fullMatch;
	});

	if (result === text) return text;

	// Write new secrets to the backend and update cache.
	let changed = false;
	const matches = text.matchAll(TRIGGER_RE);
	for (const match of matches) {
		const secret = match[1];
		if (!secret.trim()) continue;
		// Check if already exists (idempotent).
		let alreadyStored = false;
		for (const [, val] of Object.entries(store)) {
			if (val === secret) { alreadyStored = true; break; }
		}
		if (alreadyStored) continue;

		try {
			const { invoke } = await import("@tauri-apps/api/core");
			const id: string = await invoke("valut_store", { secret });
			store[id] = secret;
			changed = true;
		} catch {
			// Backend unavailable — store in cache only.
			const id = "vlt_" + Array.from(crypto.getRandomValues(new Uint8Array(4)))
				.map(b => b.toString(16).padStart(2, "0")).join("");
			store[id] = secret;
			changed = true;
		}
	}

	return changed ? text.replace(TRIGGER_RE, (_fullMatch: string, secret: string): string => {
		if (!secret.trim()) return _fullMatch;
		for (const [id, val] of Object.entries(store)) {
			if (val === secret) return `[VLT:${id}]`;
		}
		return _fullMatch;
	}) : text;
}

/**
 * Replace ``[VLT:<id>]`` references in *text* with their stored
 * values.  Unresolved references pass through unchanged so the user
 * can see which ID was referenced.
 *
 * This is synchronous — it reads from the in-memory cache populated
 * by sanitizeInput() or ensureCache().
 *
 * @param text - Output from the agent to restore.
 * @returns Display-ready text with secrets restored.
 */
export function restoreOutput(text: string): string {
	if (!text || text.indexOf("[VLT:") === -1) return text;
	if (!cache) return text;

	return text.replace(REF_RE, (_fullMatch: string, id: string): string => {
		const resolved = cacheGet(id);
		return resolved !== undefined ? resolved : _fullMatch;
	});
}

/**
 * Pre-load the cache from the backend. Call once at startup so
 * restoreOutput() works for the first agent response.
 */
export async function preloadValutCache(): Promise<void> {
	await ensureCache();
}

// ── admin helpers ────────────────────────────────────────────────────────

/** List all stored reference IDs (for debugging/introspection). */
export async function listIds(): Promise<string[]> {
	const store = await ensureCache();
	return Object.keys(store).sort();
}

/** Remove a stored secret. Returns true if it existed. */
export async function removeId(id: string): Promise<boolean> {
	const store = await ensureCache();
	if (id in store) {
		delete store[id];
		// The Rust backend doesn't have a remove command yet,
		// but the cache is authoritative for restoreOutput.
		return true;
	}
	return false;
}

/** Remove all stored secrets from cache. */
export function clearAll(): void {
	cache = {};
}

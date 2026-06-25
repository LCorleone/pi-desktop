/** Max number of sessions whose content is cached in memory. */
const SESSION_CONTENT_CACHE_SIZE = 20;

interface CachedSessionContent {
	messages: unknown[];
	state: unknown;
	cachedAt: number;
}

const contentCache = new Map<string, CachedSessionContent>();

/** Retrieve cached session content (messages + state), or null if not cached. */
export function getCachedSessionContent(sessionPath: string): CachedSessionContent | null {
	return contentCache.get(sessionPath) ?? null;
}

/** Store session content in cache. Evicts oldest entry if at capacity. */
export function setCachedSessionContent(sessionPath: string, messages: unknown[], state: unknown): void {
	contentCache.set(sessionPath, { messages, state, cachedAt: Date.now() });
	if (contentCache.size > SESSION_CONTENT_CACHE_SIZE) {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;
		for (const [key, val] of contentCache) {
			if (val.cachedAt < oldestTime) {
				oldestTime = val.cachedAt;
				oldestKey = key;
			}
		}
		if (oldestKey) contentCache.delete(oldestKey);
	}
}

/** Remove a session from the content cache (e.g., on delete). */
export function invalidateSessionContent(sessionPath: string): void {
	contentCache.delete(sessionPath);
}

/** Clear all cached session content (e.g., on app reset). */
export function clearSessionContentCache(): void {
	contentCache.clear();
}

interface CacheEntry<T> {
	data: T;
	loadedAt: number;
}

const SESSION_LIST_CACHE_TTL = 5_000;

let sessionsCache: CacheEntry<unknown> | null = null;
let inflightFetch: Promise<unknown> | null = null;

export function getCachedSessionList<T>(): { data: T; stale: boolean } | null {
	if (!sessionsCache) return null;
	const stale = Date.now() - sessionsCache.loadedAt > SESSION_LIST_CACHE_TTL;
	return { data: sessionsCache.data as T, stale };
}

export function setCachedSessionList<T>(data: T): void {
	sessionsCache = { data, loadedAt: Date.now() };
}

export function invalidateSessionListCache(): void {
	sessionsCache = null;
}

/** Fetch session list from backend with single-flight deduplication.
 *  If a fetch is already in-flight, returns the same promise. */
export async function fetchAndCacheSessionList(): Promise<unknown> {
	if (inflightFetch) return inflightFetch;
	inflightFetch = (async () => {
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			const sessions = await invoke("list_sessions");
			setCachedSessionList(sessions);
			return sessions;
		} finally {
			inflightFetch = null;
		}
	})();
	return inflightFetch;
}

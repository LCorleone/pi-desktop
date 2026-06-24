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

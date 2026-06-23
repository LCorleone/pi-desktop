interface CacheEntry<T> {
	data: T;
	loadedAt: number;
}

const SESSION_LIST_CACHE_TTL = 5_000;

let sessionsCache: CacheEntry<unknown> | null = null;

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

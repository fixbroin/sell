// src/lib/client-cache.ts

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes default for in-memory
const PERSISTENT_STALE_TIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for settings (lifetime cache)

// In-memory promise sharing to avoid redundant parallel reads of cache versions
let remoteVersionsPromise: Promise<any> | null = null;
let lastVersionFetchTime = 0;
const CACHE_VERSION_TTL_MS = 10 * 1000; // 10 seconds cache for versions check

/**
 * Fetches the remote cache versions with deduplication and in-memory caching.
 * Collapses multiple concurrent page hook calls into a single database read.
 */
export const getRemoteCacheVersions = async (): Promise<any> => {
  const now = Date.now();
  
  // Reuse the existing promise if it is still within the TTL
  if (remoteVersionsPromise && (now - lastVersionFetchTime < CACHE_VERSION_TTL_MS)) {
    return remoteVersionsPromise;
  }
  
  lastVersionFetchTime = now;
  remoteVersionsPromise = (async () => {
    try {
      const res = await fetch('/api/cache-versions', { cache: 'no-store' });
      if (res.ok) {
        return await res.json();
      }
      return {};
    } catch (e) {
      console.warn("Failed to fetch remote cache versions via server API:", e);
      // Reset the promise on failure so that subsequent calls can retry
      remoteVersionsPromise = null;
      lastVersionFetchTime = 0;
      return {};
    }
  })();
  
  return remoteVersionsPromise;
};


/**
 * Sets a value in the cache with the current timestamp.
 * @param key The cache key.
 * @param data The data to store.
 * @param persist If true, also saves to localStorage.
 */
export const setCache = (key: string, data: any, persist = false): void => {
  const entry: CacheEntry = {
    data,
    timestamp: Date.now(),
  };
  cache.set(key, entry);

  if (persist && typeof window !== 'undefined') {
    try {
      localStorage.setItem(`yourbrand_cache_${key}`, JSON.stringify(entry));
    } catch (e) {
      console.warn("client-cache: Failed to persist to localStorage", e);
    }
  }
};

/**
 * Gets a value from the cache if it exists and is not stale.
 * @param key The cache key.
 * @param usePersistence If true, checks localStorage if not in memory.
 * @returns The cached data or null if not found or stale.
 */
export const getCache = <T>(key: string, usePersistence = false): T | null => {
  let entry = cache.get(key);

  if (!entry && usePersistence && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`yourbrand_cache_${key}`);
      if (stored) {
        entry = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("client-cache: Failed to read from localStorage", e);
    }
  }

  if (!entry) {
    return null;
  }

  const staleTime = usePersistence ? PERSISTENT_STALE_TIME_MS : STALE_TIME_MS;
  const isStale = Date.now() - entry.timestamp > staleTime;
  
  if (isStale) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`yourbrand_cache_${key}`);
    }
    cache.delete(key);
    return null;
  }

  return entry.data as T;
};

/**
 * Clears the entire cache.
 */
export const clearCache = (): void => {
  cache.clear();
  if (typeof window !== 'undefined') {
    Object.keys(localStorage)
      .filter(key => key.startsWith('yourbrand_cache_'))
      .forEach(key => localStorage.removeItem(key));
  }
};

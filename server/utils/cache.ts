import type { CacheOptions, CacheSetOptions } from '#shared/types/cache';

const CACHE_NAMESPACE = 'xyra';
const CACHE_SEPARATOR = '__';
const DEFAULT_CACHE_TTL = 60;

function getCacheStorage() {
  return useStorage('cache');
}

function normalizePart(part: string | number): string {
  return String(part)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
}

export function buildCacheKey(...parts: Array<string | number | null | undefined>): string {
  const normalizedParts = parts
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .map((part) => normalizePart(part as string | number));

  return normalizedParts.length > 0
    ? [CACHE_NAMESPACE, ...normalizedParts].join(CACHE_SEPARATOR)
    : CACHE_NAMESPACE;
}

export async function getCacheItem<T>(key: string): Promise<T | null> {
  try {
    const value = await getCacheStorage().getItem<T>(key);
    return (value ?? null) as T | null;
  } catch (error) {
    console.warn(`[cache] Failed to read key ${key}:`, error);
    return null;
  }
}

export async function setCacheItem<T>(
  key: string,
  value: T,
  options: CacheSetOptions = {},
): Promise<void> {
  if (value === undefined) {
    return;
  }

  try {
    const ttl = options.ttl ?? DEFAULT_CACHE_TTL;
    if (ttl > 0) {
      await getCacheStorage().setItem(key, value, { ttl });
    } else {
      await getCacheStorage().setItem(key, value);
    }
  } catch (error) {
    console.warn(`[cache] Failed to write key ${key}:`, error);
  }
}

export async function deleteCacheItem(key: string): Promise<void> {
  try {
    await getCacheStorage().removeItem(key);
  } catch (error) {
    console.warn(`[cache] Failed to remove key ${key}:`, error);
  }
}

export async function deleteCacheItems(...keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteCacheItem(key)));
}

export async function withCache<T>(
  key: string,
  resolver: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  if (!options.skipCache) {
    const cached = await getCacheItem<T>(key);
    if (cached !== null) {
      return cached;
    }
  }

  const value = await resolver();

  if (!options.skipCache && value !== undefined && value !== null) {
    await setCacheItem(key, value, options);
  }

  return value;
}

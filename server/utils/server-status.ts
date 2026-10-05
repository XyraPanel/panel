import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  getWingsClientForServer,
  WingsConnectionError,
  WingsAuthError,
} from '#server/utils/wings-client';
import type { ServerStatus } from '#shared/types/server';
import { getCacheItem, setCacheItem, deleteCacheItem } from './cache';
import { buildServerStatusCacheKey } from './cache-keys';

// 20s rather than 5s: /api/servers (the list page) does a one-shot fetch with no
// polling, so a longer TTL cuts cache-miss frequency (and the Wings fan-out below)
// roughly 4x with no material loss of perceived freshness for a list view.
const SERVER_STATUS_CACHE_TTL = 20;
// Caps concurrent outbound Wings requests when the cache is cold (e.g. right after
// a restart, or for a large uncached server list) — unbounded Promise.all here meant
// a single page load could fire one HTTP request per server with no limit.
const STATUS_FETCH_CONCURRENCY = 15;

function isMissingWingsServerError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('404') &&
    message.includes('requested resource does not exist on this instance')
  );
}

async function fetchServerStatus(serverUuid: string): Promise<ServerStatus> {
  const db = useDrizzle();

  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, serverUuid));

  const [server] = serverRows;

  if (!server) {
    throw new Error('Server not found');
  }

  const baseStatus: ServerStatus = {
    serverId: server.id,
    serverUuid: server.uuid,
    state: 'unknown',
    isOnline: false,
    isSuspended: server.suspended,
    lastChecked: new Date().toISOString(),
  };

  try {
    const { client } = await getWingsClientForServer(serverUuid);
    const details = await client.getServerDetails(serverUuid);

    return {
      ...baseStatus,
      state: details.state,
      isOnline: details.state === 'running',
      isSuspended: details.is_suspended,
      utilization: details.utilization,
    };
  } catch (error) {
    if (!isMissingWingsServerError(error)) {
      console.error(`Failed to get status for server ${serverUuid}:`, error);
    }

    let errorMessage = 'Unknown error';
    if (error instanceof WingsAuthError) {
      errorMessage = 'Wings authentication failed';
    } else if (error instanceof WingsConnectionError) {
      errorMessage = 'Wings daemon unavailable';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      ...baseStatus,
      state: 'offline',
      error: errorMessage,
    };
  }
}

export async function getServerStatus(
  serverUuid: string,
  options: { skipCache?: boolean } = {},
): Promise<ServerStatus> {
  const cacheKey = buildServerStatusCacheKey(serverUuid);

  if (!options.skipCache) {
    const cached = await getCacheItem<ServerStatus>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const status = await fetchServerStatus(serverUuid);
  await setCacheItem(cacheKey, status, { ttl: SERVER_STATUS_CACHE_TTL });
  return status;
}

export async function invalidateServerStatusCache(serverUuid: string): Promise<void> {
  const cacheKey = buildServerStatusCacheKey(serverUuid);
  await deleteCacheItem(cacheKey);
}

export async function updateServerStatus(serverUuid: string): Promise<void> {
  const db = useDrizzle();
  const status = await getServerStatus(serverUuid, { skipCache: true });

  await db
    .update(tables.servers)
    .set({
      status: status.state,
      suspended: status.isSuspended,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tables.servers.uuid, serverUuid));
}

function toServerStatusError(serverUuid: string, reason: unknown): ServerStatus {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : 'Failed to get status';

  return {
    serverId: 'unknown',
    serverUuid,
    state: 'error',
    isOnline: false,
    isSuspended: false,
    lastChecked: new Date().toISOString(),
    error: message,
  };
}

export async function getMultipleServerStatuses(serverUuids: string[]): Promise<ServerStatus[]> {
  const results: ServerStatus[] = [];

  for (let i = 0; i < serverUuids.length; i += STATUS_FETCH_CONCURRENCY) {
    const batch = serverUuids.slice(i, i + STATUS_FETCH_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((uuid) => getServerStatus(uuid)));

    settled.forEach((result, index) => {
      const serverUuid = batch[index] ?? 'unknown';
      results.push(
        result.status === 'fulfilled' ? result.value : toServerStatusError(serverUuid, result.reason),
      );
    });
  }

  return results;
}

export async function refreshAllServerStatuses(): Promise<void> {
  const db = useDrizzle();

  const servers = await db.select({ uuid: tables.servers.uuid }).from(tables.servers);

  const serverUuids = servers.map((s) => s.uuid);

  const batchSize = 5;
  for (let i = 0; i < serverUuids.length; i += batchSize) {
    const batch = serverUuids.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((uuid) => updateServerStatus(uuid)));

    if (i + batchSize < serverUuids.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

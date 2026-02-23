import { buildCacheKey } from './cache';

export function buildScheduleListCacheKey(serverId: string) {
  return buildCacheKey('server', serverId, 'schedules');
}

export function buildScheduleTasksCacheKey(scheduleId: string) {
  return buildCacheKey('schedule', scheduleId, 'tasks');
}

export function buildServerSubusersCacheKey(serverId: string) {
  return buildCacheKey('server', serverId, 'subusers');
}

export function buildServerUserPermissionsCacheKey(serverId: string, userId: string) {
  return buildCacheKey('server', serverId, 'user', userId, 'permissions');
}

export function buildServerStatusCacheKey(serverUuid: string) {
  return buildCacheKey('server-status', serverUuid);
}

export function buildUserPermissionsMapCacheKey(userId: string) {
  return buildCacheKey('user', userId, 'permissions-map');
}

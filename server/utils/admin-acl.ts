import type { ApiKeyPermissions } from '#shared/types/admin';

export const ADMIN_ACL_PERMISSIONS = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
};

export const ADMIN_ACL_RESOURCES = {
  SERVERS: 'servers',
  NODES: 'nodes',
  ALLOCATIONS: 'allocations',
  USERS: 'users',
  LOCATIONS: 'locations',
  NESTS: 'nests',
  EGGS: 'eggs',
  DATABASE_HOSTS: 'database_hosts',
  SERVER_DATABASES: 'server_databases',
  MOUNTS: 'mounts',
  AUDIT: 'audit',
  DASHBOARD: 'dashboard',
  PANEL_SETTINGS: 'panel_settings',
  SCHEDULES: 'schedules',
  API_KEYS: 'api_keys',
};

export type AdminAclResource = (typeof ADMIN_ACL_RESOURCES)[keyof typeof ADMIN_ACL_RESOURCES];
export type AdminAclPermission = (typeof ADMIN_ACL_PERMISSIONS)[keyof typeof ADMIN_ACL_PERMISSIONS];

export function canPerformAction(
  permission: number,
  action: AdminAclPermission = ADMIN_ACL_PERMISSIONS.READ,
): boolean {
  return (permission & action) !== 0;
}

const RESOURCE_TO_PERMISSION_KEY: Record<AdminAclResource, keyof ApiKeyPermissions | undefined> = {
  [ADMIN_ACL_RESOURCES.SERVERS]: 'servers',
  [ADMIN_ACL_RESOURCES.NODES]: 'nodes',
  [ADMIN_ACL_RESOURCES.ALLOCATIONS]: 'allocations',
  [ADMIN_ACL_RESOURCES.USERS]: 'users',
  [ADMIN_ACL_RESOURCES.LOCATIONS]: 'locations',
  [ADMIN_ACL_RESOURCES.NESTS]: 'nests',
  [ADMIN_ACL_RESOURCES.EGGS]: 'eggs',
  [ADMIN_ACL_RESOURCES.DATABASE_HOSTS]: 'databaseHosts',
  [ADMIN_ACL_RESOURCES.SERVER_DATABASES]: 'serverDatabases',
  [ADMIN_ACL_RESOURCES.MOUNTS]: 'mounts',
  [ADMIN_ACL_RESOURCES.AUDIT]: 'audit',
  [ADMIN_ACL_RESOURCES.DASHBOARD]: 'dashboard',
  [ADMIN_ACL_RESOURCES.PANEL_SETTINGS]: 'panel_settings',
  [ADMIN_ACL_RESOURCES.SCHEDULES]: 'schedules',
  [ADMIN_ACL_RESOURCES.API_KEYS]: 'api_keys',
};

export function checkApiKeyPermission(
  permissions: ApiKeyPermissions,
  resource: AdminAclResource,
  action: AdminAclPermission = ADMIN_ACL_PERMISSIONS.READ,
): boolean {
  const permissionKey = RESOURCE_TO_PERMISSION_KEY[resource];

  if (!permissionKey) {
    console.warn(`[AdminAcl] Unknown resource: ${resource}`);
    return false;
  }

  const permissionActions = permissions[permissionKey as keyof ApiKeyPermissions] ?? [];

  if (!Array.isArray(permissionActions)) {
    return false;
  }

  const actionName = action === ADMIN_ACL_PERMISSIONS.READ ? 'read' : 'write';
  return permissionActions.includes(actionName as 'read' | 'write');
}

export function getResourceList(): AdminAclResource[] {
  return Object.values(ADMIN_ACL_RESOURCES);
}

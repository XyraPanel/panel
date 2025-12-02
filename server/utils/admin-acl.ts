import type { ApiKeyPermissions } from '#shared/types/admin'

export const ADMIN_ACL_PERMISSIONS = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
}

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
}

export type AdminAclResource = typeof ADMIN_ACL_RESOURCES[keyof typeof ADMIN_ACL_RESOURCES]
export type AdminAclPermission = typeof ADMIN_ACL_PERMISSIONS[keyof typeof ADMIN_ACL_PERMISSIONS]

export function canPerformAction(
  permission: number,
  action: AdminAclPermission = ADMIN_ACL_PERMISSIONS.READ
): boolean {
  return (permission & action) !== 0
}

const RESOURCE_TO_PERMISSION_KEY: Record<AdminAclResource, keyof ApiKeyPermissions> = {
  [ADMIN_ACL_RESOURCES.SERVERS]: 'rServers',
  [ADMIN_ACL_RESOURCES.NODES]: 'rNodes',
  [ADMIN_ACL_RESOURCES.ALLOCATIONS]: 'rAllocations',
  [ADMIN_ACL_RESOURCES.USERS]: 'rUsers',
  [ADMIN_ACL_RESOURCES.LOCATIONS]: 'rLocations',
  [ADMIN_ACL_RESOURCES.NESTS]: 'rNests',
  [ADMIN_ACL_RESOURCES.EGGS]: 'rEggs',
  [ADMIN_ACL_RESOURCES.DATABASE_HOSTS]: 'rDatabaseHosts',
  [ADMIN_ACL_RESOURCES.SERVER_DATABASES]: 'rServerDatabases',
}

export function checkApiKeyPermission(
  permissions: ApiKeyPermissions,
  resource: AdminAclResource,
  action: AdminAclPermission = ADMIN_ACL_PERMISSIONS.READ
): boolean {
  const permissionKey = RESOURCE_TO_PERMISSION_KEY[resource]
  
  if (!permissionKey) {
    console.warn(`[AdminAcl] Unknown resource: ${resource}`)
    return false
  }
  
  const permissionValue = permissions[permissionKey] ?? ADMIN_ACL_PERMISSIONS.NONE
  return canPerformAction(permissionValue, action)
}

export function getResourceList(): AdminAclResource[] {
  return Object.values(ADMIN_ACL_RESOURCES)
}


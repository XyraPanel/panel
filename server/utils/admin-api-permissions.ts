import type { H3Event } from 'h3';
import { checkApiKeyPermission, ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from './admin-acl';
import type { AdminAclResource, AdminAclPermission } from './admin-acl';
import type { ApiKeyPermissions } from '#shared/types/admin';

export async function requireAdminApiKeyPermission(
  event: H3Event,
  resource: AdminAclResource,
  action: AdminAclPermission = ADMIN_ACL_PERMISSIONS.READ,
): Promise<void> {
  const contextAuth = (event.context as { auth?: { apiKey?: { permissions: ApiKeyPermissions } } })
    .auth;

  if (!contextAuth?.apiKey) {
    return;
  }

  const apiKeyPermissions = contextAuth.apiKey.permissions;

  if (!checkApiKeyPermission(apiKeyPermissions, resource, action)) {
    const actionName = action === ADMIN_ACL_PERMISSIONS.READ ? 'read' : 'write';
    throw createError({
      status: 403,
      statusText: 'Forbidden',
      message: `API key does not have ${actionName} permission for ${resource}`,
    });
  }
}

export const ADMIN_ENDPOINT_RESOURCE_MAP: Record<
  string,
  { resource: AdminAclResource; action: AdminAclPermission }
> = {
  '/api/admin/servers': {
    resource: ADMIN_ACL_RESOURCES.SERVERS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'GET /api/admin/servers': {
    resource: ADMIN_ACL_RESOURCES.SERVERS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'POST /api/admin/servers': {
    resource: ADMIN_ACL_RESOURCES.SERVERS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'GET /api/admin/servers/[id]': {
    resource: ADMIN_ACL_RESOURCES.SERVERS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'PATCH /api/admin/servers/[id]': {
    resource: ADMIN_ACL_RESOURCES.SERVERS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'DELETE /api/admin/servers/[id]': {
    resource: ADMIN_ACL_RESOURCES.SERVERS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  '/api/admin/nodes': { resource: ADMIN_ACL_RESOURCES.NODES, action: ADMIN_ACL_PERMISSIONS.READ },
  'GET /api/admin/nodes': {
    resource: ADMIN_ACL_RESOURCES.NODES,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'POST /api/admin/nodes': {
    resource: ADMIN_ACL_RESOURCES.NODES,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'GET /api/admin/nodes/[id]': {
    resource: ADMIN_ACL_RESOURCES.NODES,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'PATCH /api/admin/nodes/[id]': {
    resource: ADMIN_ACL_RESOURCES.NODES,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  '/api/admin/wings/nodes': {
    resource: ADMIN_ACL_RESOURCES.NODES,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  '/api/admin/users': { resource: ADMIN_ACL_RESOURCES.USERS, action: ADMIN_ACL_PERMISSIONS.READ },
  'GET /api/admin/users': {
    resource: ADMIN_ACL_RESOURCES.USERS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'POST /api/admin/users': {
    resource: ADMIN_ACL_RESOURCES.USERS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'GET /api/admin/users/[id]': {
    resource: ADMIN_ACL_RESOURCES.USERS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'PATCH /api/admin/users/[id]': {
    resource: ADMIN_ACL_RESOURCES.USERS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  '/api/admin/allocations': {
    resource: ADMIN_ACL_RESOURCES.ALLOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'GET /api/admin/allocations': {
    resource: ADMIN_ACL_RESOURCES.ALLOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'PATCH /api/admin/allocations/[id]': {
    resource: ADMIN_ACL_RESOURCES.ALLOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'DELETE /api/admin/allocations/[id]': {
    resource: ADMIN_ACL_RESOURCES.ALLOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  '/api/admin/locations': {
    resource: ADMIN_ACL_RESOURCES.LOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'GET /api/admin/locations': {
    resource: ADMIN_ACL_RESOURCES.LOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'POST /api/admin/locations': {
    resource: ADMIN_ACL_RESOURCES.LOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'GET /api/admin/locations/[id]': {
    resource: ADMIN_ACL_RESOURCES.LOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'PATCH /api/admin/locations/[id]': {
    resource: ADMIN_ACL_RESOURCES.LOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'DELETE /api/admin/locations/[id]': {
    resource: ADMIN_ACL_RESOURCES.LOCATIONS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  '/api/admin/nests': { resource: ADMIN_ACL_RESOURCES.NESTS, action: ADMIN_ACL_PERMISSIONS.READ },
  'GET /api/admin/nests': {
    resource: ADMIN_ACL_RESOURCES.NESTS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'POST /api/admin/nests': {
    resource: ADMIN_ACL_RESOURCES.NESTS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'GET /api/admin/nests/[id]': {
    resource: ADMIN_ACL_RESOURCES.NESTS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'DELETE /api/admin/nests/[id]': {
    resource: ADMIN_ACL_RESOURCES.NESTS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  '/api/admin/eggs': { resource: ADMIN_ACL_RESOURCES.EGGS, action: ADMIN_ACL_PERMISSIONS.READ },
  'GET /api/admin/eggs': { resource: ADMIN_ACL_RESOURCES.EGGS, action: ADMIN_ACL_PERMISSIONS.READ },
  'POST /api/admin/eggs': {
    resource: ADMIN_ACL_RESOURCES.EGGS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'GET /api/admin/eggs/[id]': {
    resource: ADMIN_ACL_RESOURCES.EGGS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  '/api/admin/database-hosts': {
    resource: ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'GET /api/admin/database-hosts': {
    resource: ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
  'POST /api/admin/database-hosts': {
    resource: ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  'DELETE /api/admin/database-hosts/[id]': {
    resource: ADMIN_ACL_RESOURCES.DATABASE_HOSTS,
    action: ADMIN_ACL_PERMISSIONS.WRITE,
  },
  '/api/admin/servers/[id]/databases': {
    resource: ADMIN_ACL_RESOURCES.SERVER_DATABASES,
    action: ADMIN_ACL_PERMISSIONS.READ,
  },
};

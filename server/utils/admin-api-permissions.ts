import type { H3Event } from 'h3';
import { checkApiKeyPermission, ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from './admin-acl';
import type { AdminAclResource, AdminAclPermission } from './admin-acl';
import type { ApiKeyPermissions } from '#shared/types/admin';

export function getContextApiKeyPermissions(event: H3Event): ApiKeyPermissions | null {
  const contextAuth = event.context?.auth;
  const apiKey = contextAuth && typeof contextAuth === 'object' ? contextAuth.apiKey : null;
  if (!apiKey || typeof apiKey !== 'object') {
    return null;
  }

  return apiKey.permissions ?? null;
}

export async function requireAdminApiKeyPermission(
  event: H3Event,
  resource: AdminAclResource,
  action: AdminAclPermission = ADMIN_ACL_PERMISSIONS.READ,
): Promise<void> {
  const apiKeyPermissions = getContextApiKeyPermissions(event);
  if (!apiKeyPermissions) {
    return;
  }

  if (!checkApiKeyPermission(apiKeyPermissions, resource, action)) {
    const actionName = action === ADMIN_ACL_PERMISSIONS.READ ? 'read' : 'write';
    throw createError({
      status: 403,
      message: `API key does not have ${actionName} permission for ${resource}`,
    });
  }
}

/**
 * When the caller is authenticated via an API key (not a live session), a new key
 * they mint must not carry more access than the calling key itself has — otherwise a
 * deliberately narrow-scoped key (e.g. api_keys:write only) could mint itself a
 * fully-privileged replacement, defeating the point of scoping. Session-authenticated
 * admins are unrestricted, matching how an interactively-logged-in admin is trusted.
 */
export function requireApiKeyPermissionSubset(
  event: H3Event,
  requestedPermissions: ApiKeyPermissions,
): void {
  const callerPermissions = getContextApiKeyPermissions(event);
  if (!callerPermissions) {
    return;
  }

  for (const [resource, actions] of Object.entries(requestedPermissions)) {
    if (!Array.isArray(actions)) {
      continue;
    }

    for (const action of actions) {
      const aclAction =
        action === 'write' || action === 'delete'
          ? ADMIN_ACL_PERMISSIONS.WRITE
          : ADMIN_ACL_PERMISSIONS.READ;

      if (!checkApiKeyPermission(callerPermissions, resource, aclAction)) {
        throw createError({
          status: 403,
          message: `Cannot grant "${resource}: ${action}" — it exceeds the calling API key's own permissions`,
        });
      }
    }
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

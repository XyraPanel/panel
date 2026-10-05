import type { H3Event } from 'h3';
import { getServerSession } from '#server/utils/session';
import { permissionManager } from '#server/utils/permission-manager';
import { resolveSessionUser } from '#server/utils/auth/sessionUser';
import type {
  Permission,
  PermissionContext,
  PermissionMiddlewareOptions,
} from '#shared/types/server';

export async function requireServerPermission(
  event: H3Event,
  options: PermissionMiddlewareOptions,
): Promise<PermissionContext> {
  const session = await getServerSession(event);
  const user = resolveSessionUser(session);

  if (!user?.id) {
    throw createError({
      status: 401,
      message: 'Authentication required',
    });
  }

  if (!options.serverId) {
    throw createError({
      status: 400,
      message: 'Server ID is required for permission check',
    });
  }

  const userPermissions = await permissionManager.getUserPermissions(user.id);
  const isAdmin = userPermissions.isAdmin;
  const serverPerms = userPermissions.serverPermissions.get(options.serverId) || [];

  const isOwner = userPermissions.ownedServerIds.has(options.serverId);

  if (isAdmin && options.allowAdmin !== false) {
    return {
      userId: user.id,
      isAdmin: true,
      isOwner: false,
      hasPermissions: true,
      missingPermissions: [],
    };
  }

  if (isOwner && options.allowOwner !== false) {
    return {
      userId: user.id,
      isAdmin: false,
      isOwner: true,
      hasPermissions: true,
      missingPermissions: [],
    };
  }

  const missingPermissions: Permission[] = [];
  for (const permission of options.requiredPermissions) {
    if (!serverPerms.includes(permission)) {
      missingPermissions.push(permission);
    }
  }

  const hasPermissions = missingPermissions.length === 0;

  if (!hasPermissions) {
    throw createError({
      status: 403,
      message: `Missing required permissions: ${missingPermissions.join(', ')}`,
      data: {
        missingPermissions,
        requiredPermissions: options.requiredPermissions,
      },
    });
  }

  return {
    userId: user.id,
    isAdmin: false,
    isOwner: false,
    hasPermissions: true,
    missingPermissions: [],
  };
}

/**
 * Validates that permissions being granted to a subuser are (a) recognized Permission
 * values and (b) a subset of the granting actor's own effective permissions on this
 * server — otherwise a subuser could grant themselves or another subuser more access
 * than they have, including admin.* hierarchy shorthand that expands to full control.
 * Real admins bypass the subset check (they already have unrestricted access), but
 * still only real Permission values, never arbitrary strings.
 */
export async function requireGrantablePermissions(
  event: H3Event,
  serverId: string,
  requestedPermissions: string[],
): Promise<Permission[]> {
  const session = await getServerSession(event);
  const user = resolveSessionUser(session);

  if (!user?.id) {
    throw createError({
      status: 401,
      message: 'Authentication required',
    });
  }

  const allPermissions = new Set<string>(permissionManager.getAllPermissions());
  const isPermission = (p: string): p is Permission => allPermissions.has(p);

  if (!requestedPermissions.every(isPermission)) {
    const invalid = requestedPermissions.filter((p) => !isPermission(p));
    throw createError({
      status: 400,
      message: `Unknown permission(s): ${invalid.join(', ')}`,
    });
  }

  const validated = requestedPermissions;

  const userPermissions = await permissionManager.getUserPermissions(user.id);
  if (userPermissions.isAdmin) {
    return validated;
  }

  const actorPermissions = new Set(
    userPermissions.ownedServerIds.has(serverId)
      ? permissionManager.getAllPermissions().filter((p) => !p.startsWith('admin.'))
      : (userPermissions.serverPermissions.get(serverId) ?? []),
  );

  const disallowed = validated.filter((p) => !actorPermissions.has(p));
  if (disallowed.length > 0) {
    throw createError({
      status: 403,
      message: `Cannot grant permission(s) you do not have: ${disallowed.join(', ')}`,
    });
  }

  return validated;
}

export async function requirePermission(
  event: H3Event,
  permission: Permission,
  serverId: string,
): Promise<PermissionContext> {
  return requireServerPermission(event, {
    requiredPermissions: [permission],
    serverId,
  });
}

export async function requireAllPermissions(
  event: H3Event,
  permissions: Permission[],
  serverId: string,
): Promise<PermissionContext> {
  return requireServerPermission(event, {
    requiredPermissions: permissions,
    serverId,
  });
}

export async function requireAnyPermission(
  event: H3Event,
  permissions: Permission[],
  serverId: string,
): Promise<PermissionContext> {
  const session = await getServerSession(event);
  const user = resolveSessionUser(session);

  if (!user?.id) {
    throw createError({
      status: 401,
      message: 'Authentication required',
    });
  }

  const userPermissions = await permissionManager.getUserPermissions(user.id);
  const isAdmin = userPermissions.isAdmin;
  const serverPerms = userPermissions.serverPermissions.get(serverId) || [];

  const isOwner = userPermissions.ownedServerIds.has(serverId);

  if (isAdmin || isOwner) {
    return {
      userId: user.id,
      isAdmin,
      isOwner,
      hasPermissions: true,
      missingPermissions: [],
    };
  }

  const hasAnyPermission = permissions.some((permission) => serverPerms.includes(permission));

  if (!hasAnyPermission) {
    throw createError({
      status: 403,
      message: `Missing any of required permissions: ${permissions.join(', ')}`,
      data: {
        requiredPermissions: permissions,
      },
    });
  }

  return {
    userId: user.id,
    isAdmin: false,
    isOwner: false,
    hasPermissions: true,
    missingPermissions: [],
  };
}

export async function requireAdminPermission(event: H3Event): Promise<PermissionContext> {
  const session = await getServerSession(event);
  const user = resolveSessionUser(session);

  if (!user?.id) {
    throw createError({
      status: 401,
      message: 'Authentication required',
    });
  }

  const userPermissions = await permissionManager.getUserPermissions(user.id);

  if (!userPermissions.isAdmin) {
    throw createError({
      status: 403,
      message: 'Administrator privileges required',
    });
  }

  return {
    userId: user.id,
    isAdmin: true,
    isOwner: false,
    hasPermissions: true,
    missingPermissions: [],
  };
}

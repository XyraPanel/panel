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
      statusText: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  if (!options.serverId) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Server ID is required for permission check',
    });
  }

  const userPermissions = await permissionManager.getUserPermissions(user.id);
  const isAdmin = userPermissions.isAdmin;
  const serverPerms = userPermissions.serverPermissions.get(options.serverId) || [];

  const isOwner = serverPerms.length > 0 && serverPerms.includes('server.view');

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
      statusText: 'Forbidden',
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
      statusText: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  const userPermissions = await permissionManager.getUserPermissions(user.id);
  const isAdmin = userPermissions.isAdmin;
  const serverPerms = userPermissions.serverPermissions.get(serverId) || [];

  const isOwner = serverPerms.length > 0 && serverPerms.includes('server.view');

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
      statusText: 'Forbidden',
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
      statusText: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  const userPermissions = await permissionManager.getUserPermissions(user.id);

  if (!userPermissions.isAdmin) {
    throw createError({
      status: 403,
      statusText: 'Forbidden',
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

import type { H3Event } from 'h3';
import { createError, getQuery } from 'h3';
import { getServerSession } from '#server/utils/session';
import type {
  ServerAccessOptions as SharedServerAccessOptions,
  ServerRequestContext as SharedServerRequestContext,
} from '#shared/types/server';
import { resolveSessionUser } from '#server/utils/auth/sessionUser';
import { findServerByIdentifier } from '#server/utils/serversStore';
import { useDrizzle, tables, and, eq } from '#server/utils/drizzle';
import { getUserPermissions } from '#server/utils/permissions';
import { resolveNodeConnection } from '#server/utils/wings/nodesStore';
import { normalizePermissionPayload } from '#server/utils/jwt';
import type { StoredWingsNode } from '#shared/types/wings';

type ServerRequestContext = SharedServerRequestContext<typeof tables.servers.$inferSelect>;
type ServerAccessOptions = SharedServerAccessOptions;

export async function resolveServerRequest(
  event: H3Event,
  options: ServerAccessOptions = {},
): Promise<ServerRequestContext> {
  const identifier = options.identifier ?? event.context.params?.id;

  if (!identifier || typeof identifier !== 'string') {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  const contextAuth = (
    event.context as {
      auth?: {
        session?: Awaited<ReturnType<typeof getServerSession>>;
        user?: ReturnType<typeof resolveSessionUser>;
      };
    }
  ).auth;

  let user: ReturnType<typeof resolveSessionUser> | null = null;

  if (contextAuth?.user) {
    const candidate = contextAuth.user as Partial<ReturnType<typeof resolveSessionUser>> | null;
    if (candidate && candidate.id && candidate.username && candidate.role) {
      user = {
        id: candidate.id,
        username: candidate.username,
        role: candidate.role,
        permissions: candidate.permissions ?? [],
        email: candidate.email ?? null,
        name: candidate.name ?? null,
        image: candidate.image ?? null,
        remember: candidate.remember ?? null,
        passwordResetRequired: candidate.passwordResetRequired ?? false,
      };
    }
  }

  if (!user) {
    const session = await getServerSession(event);
    user = resolveSessionUser(session);
  }

  if (!user) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  const server = await findServerByIdentifier(identifier);

  if (!server) {
    throw createError({ status: 404, statusText: 'Server not found' });
  }

  const isAdmin = user.role === 'admin';
  const isOwner = server.ownerId === user.id;

  const db = useDrizzle();
  let subuserPermissions: string[] | null = null;

  if (!isAdmin && !isOwner) {
    const subuserRows = await db
      .select({ permissions: tables.serverSubusers.permissions })
      .from(tables.serverSubusers)
      .where(
        and(
          eq(tables.serverSubusers.serverId, server.id),
          eq(tables.serverSubusers.userId, user.id || ''),
        ),
      )
      .limit(1);

    const subuser = subuserRows[0];

    if (!subuser) {
      throw createError({ status: 403, statusText: 'Forbidden' });
    }

    subuserPermissions = normalizePermissionPayload(subuser.permissions);
  }

  let permissions = (await getUserPermissions(user.id || '', server.id)) as string[];

  // websocket.connect is automatically granted to anyone with server access
  if (!permissions.includes('websocket.connect')) {
    permissions = [...permissions, 'websocket.connect'];
  }

  const requiredPermissions = options.requiredPermissions ?? options.fallbackPermissions ?? [];

  if (requiredPermissions.length > 0) {
    const permissionsArray = permissions as string[];

    const permissionMap: Record<string, string[]> = {
      'file.write': ['file.write', 'file.update'], // file.write (Wings) maps to both file.write and file.update (Panel)
      'file.read': ['file.read'],
      'file.delete': ['file.delete'],
      'file.upload': ['file.create', 'file.update', 'file.write'],
      'file.download': ['file.read'],
      'file.create': ['file.create'],
      'file.update': ['file.update', 'file.write'],
    };

    const missing = requiredPermissions.filter((requiredPerm) => {
      if (permissionsArray.includes(requiredPerm)) {
        return false;
      }

      const mappedPerms = permissionMap[requiredPerm] || [];
      return !mappedPerms.some((mappedPerm) => permissionsArray.includes(mappedPerm));
    });

    if (missing.length > 0) {
      throw createError({
        status: 403,
        statusText: 'Forbidden',
        message: `Missing permissions: ${missing.join(', ')}`,
      });
    }
  }

  const requireNode = options.requireNode !== false;
  let node: StoredWingsNode | null = null;
  let nodeConnection: ServerRequestContext['nodeConnection'] = null;

  if (requireNode) {
    const queryNodeIdRaw = getQuery(event).node;
    if (!server.nodeId) {
      throw createError({ status: 500, statusText: 'Server has no assigned node' });
    }

    const resolved = await resolveNodeConnection(
      queryNodeIdRaw && typeof queryNodeIdRaw === 'string' && queryNodeIdRaw.length > 0
        ? queryNodeIdRaw
        : server.nodeId,
    );
    node = resolved.stored;
    nodeConnection = {
      tokenId: resolved.connection.tokenId,
      tokenSecret: resolved.connection.tokenSecret,
      combinedToken: resolved.connection.combinedToken,
    };
  }

  return {
    user,
    server,
    permissions: permissions as string[],
    isAdmin,
    isOwner,
    subuserPermissions,
    node,
    nodeConnection,
  };
}

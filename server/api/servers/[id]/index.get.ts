import { and, eq } from 'drizzle-orm';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { getServerLimits, listServerAllocations } from '#server/utils/serversStore';
import { permissionManager } from '#server/utils/permission-manager';
import { getServerStatus } from '#server/utils/server-status';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import type { PanelServerDetails, ServerAllocationSummary } from '#shared/types/server';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Missing server identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.view'],
    allowOwner: true,
    allowAdmin: true,
  });

  const db = useDrizzle();
  const userPermissions = await permissionManager.getUserPermissions(user.id);
  const serverPerms = userPermissions.serverPermissions.get(server.id) || [];

  const nodeRow = server.nodeId
    ? ((
        await db
          .select({ id: tables.wingsNodes.id, name: tables.wingsNodes.name })
          .from(tables.wingsNodes)
          .where(eq(tables.wingsNodes.id, server.nodeId))
          .limit(1)
      )[0] ?? null)
    : null;

  const ownerRow = server.ownerId
    ? ((
        await db
          .select({ id: tables.users.id, username: tables.users.username })
          .from(tables.users)
          .where(eq(tables.users.id, server.ownerId))
          .limit(1)
      )[0] ?? null)
    : null;

  const limits = await getServerLimits(server.id);
  const primaryAllocationRow = await db
    .select({
      ip: tables.serverAllocations.ip,
      port: tables.serverAllocations.port,
      notes: tables.serverAllocations.notes,
    })
    .from(tables.servers)
    .leftJoin(
      tables.serverAllocations,
      and(
        eq(tables.serverAllocations.serverId, tables.servers.id),
        eq(tables.serverAllocations.isPrimary, true),
      ),
    )
    .where(eq(tables.servers.id, server.id))
    .limit(1);

  const [primaryAllocationResult] = primaryAllocationRow;

  const allAllocations = await listServerAllocations(server.id);
  const additionalAllocations = allAllocations.filter((allocation) => !allocation.isPrimary);

  const allocationMapper = (allocation: {
    ip: string;
    port: number;
    notes?: string | null;
  }): ServerAllocationSummary => ({
    ip: allocation.ip,
    port: allocation.port,
    description: allocation.notes ?? '',
  });

  const primaryAllocation =
    primaryAllocationResult &&
    primaryAllocationResult.ip !== null &&
    primaryAllocationResult.port !== null
      ? {
          ip: primaryAllocationResult.ip,
          port: primaryAllocationResult.port,
          notes: primaryAllocationResult.notes,
        }
      : null;

  let actualStatus = server.status ?? null;
  let actualSuspended = Boolean(server.suspended);

  if (server.uuid) {
    try {
      const status = await getServerStatus(server.uuid);
      actualStatus = status.state || actualStatus;
      actualSuspended = status.isSuspended ?? actualSuspended;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('404') && !errorMessage.includes('not found')) {
        console.warn(`Failed to resolve cached status for server ${server.uuid}:`, errorMessage);
      }
    }
  }

  const response: PanelServerDetails = {
    id: server.id,
    uuid: server.uuid,
    identifier: server.identifier,
    name: server.name,
    description: server.description ?? null,
    status: actualStatus,
    suspended: actualSuspended,
    node: {
      id: nodeRow?.id ?? null,
      name: nodeRow?.name ?? null,
    },
    limits: {
      memory: limits?.memory ?? null,
      disk: limits?.disk ?? null,
      cpu: limits?.cpu ?? null,
      swap: null,
      io: limits?.io ?? null,
    },
    createdAt:
      server.createdAt instanceof Date
        ? server.createdAt
        : new Date(server.createdAt).toISOString(),
    allocations: {
      primary: primaryAllocation ? allocationMapper(primaryAllocation) : null,
      additional: additionalAllocations.map(allocationMapper),
    },
    owner: {
      id: ownerRow?.id ?? null,
      username: ownerRow?.username ?? null,
    },
    permissions: serverPerms,
  };

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.details.viewed',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      permissionsCount: serverPerms.length,
    },
  });

  return {
    data: response,
  };
});

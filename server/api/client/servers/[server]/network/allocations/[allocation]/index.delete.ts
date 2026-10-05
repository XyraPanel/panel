import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';
import { recordServerActivity } from '#server/utils/server-activity';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Network'],
    summary: 'Remove an allocation',
    description:
      'Detaches a non-primary network allocation from the server. Requires the server.allocation.delete permission (owner/admin always allowed). Fails if the server has no allocation limit set, or if the target is the primary allocation.',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'allocation', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: {
      '200': {
        description: 'Allocation removed',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'No allocation limit set on server, or target is the primary allocation' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.allocation.delete permission' },
      '404': { description: 'Server or allocation not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');
  const allocationId = getRouterParam(event, 'allocation');

  if (!serverIdentifier || !allocationId) {
    throw createError({
      status: 400,
      message: 'Server and allocation identifiers are required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.allocation.delete'],
    allowOwner: true,
    allowAdmin: true,
  });

  try {
    if (!server.allocationLimit) {
      throw createError({
        status: 400,
        message: 'You cannot delete allocations for this server: no allocation limit is set.',
      });
    }

    const db = useDrizzle();
    const [allocation] = await db
      .select()
      .from(tables.serverAllocations)
      .where(
        and(
          eq(tables.serverAllocations.id, allocationId),
          eq(tables.serverAllocations.serverId, server.id),
        ),
      )
      .limit(1);

    if (!allocation) {
      throw createError({
        status: 404,
        message: 'Allocation not found',
      });
    }

    if (allocation.id === server.allocationId) {
      throw createError({
        status: 400,
        message: 'Cannot delete primary allocation',
      });
    }

    await db
      .update(tables.serverAllocations)
      .set({
        serverId: null,
      })
      .where(eq(tables.serverAllocations.id, allocationId));

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.allocation.deleted',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        allocationId,
        ip: allocation?.ip,
        port: allocation?.port,
      },
    });

    await invalidateServerCaches({
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
    });

    return {
      data: {
        success: true,
        message: 'Allocation removed from server',
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Server Allocation Remove] Failed for server:', serverIdentifier, 'allocation:', allocationId, error);
    throw createError({
      status: 500,
      message: 'Failed to remove allocation from server',
    });
  }
});

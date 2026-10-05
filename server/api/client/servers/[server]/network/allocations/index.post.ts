import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, isNull, and } from '#server/utils/drizzle';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';
import { recordServerActivity } from '#server/utils/server-activity';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Network'],
    summary: 'Assign a new allocation',
    description:
      'Assigns the first available allocation on the server\'s node to the server. Requires the server.allocation.create permission (owner/admin always allowed). Note: this route shares the same path as POST /network/allocations (allocations.post.ts); only one handler will actually be registered by Nitro.',
    parameters: [{ name: 'server', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': {
        description: 'Allocation assigned',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    ip: { type: 'string' },
                    port: { type: 'integer' },
                    ipAlias: { type: 'string', nullable: true },
                    notes: { type: 'string', nullable: true },
                    isPrimary: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Allocation limit reached, or missing server.allocation.create permission' },
      '404': { description: 'No available allocations on this node' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverIdentifier = getRouterParam(event, 'server');

  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.allocation.create'],
    allowOwner: true,
    allowAdmin: true,
  });

  try {
    const db = useDrizzle();
    const existingAllocations = await db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.serverId, server.id));

    if (server.allocationLimit && existingAllocations.length >= server.allocationLimit) {
      throw createError({
        status: 403,
        message: 'Allocation limit reached',
      });
    }

    const availableAllocations = await db
      .select()
      .from(tables.serverAllocations)
      .where(
        and(
          eq(tables.serverAllocations.nodeId, server.nodeId!),
          isNull(tables.serverAllocations.serverId),
        ),
      );

    if (availableAllocations.length === 0) {
      throw createError({
        status: 404,
        message: 'No available allocations on this node',
      });
    }

    const allocation = availableAllocations[0];

    if (!allocation) {
      throw createError({
        status: 404,
        message: 'No allocation found',
      });
    }

    const now = new Date().toISOString();
    const allocationId = allocation.id;

    await db
      .update(tables.serverAllocations)
      .set({
        serverId: server.id,
        updatedAt: now,
      })
      .where(eq(tables.serverAllocations.id, allocation.id));

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.allocation.created',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        allocationId,
        ip: allocation.ip,
        port: allocation.port,
      },
    });

    await invalidateServerCaches({
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
    });

    return {
      data: {
        id: allocation.id,
        ip: allocation.ip,
        port: allocation.port,
        ipAlias: allocation.ipAlias ?? null,
        notes: allocation.notes ?? null,
        isPrimary: Boolean(allocation.id === server.allocationId),
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Server Allocation Index Post] Failed for server:', serverIdentifier, error);
    throw createError({
      status: 500,
      message: 'Failed to assign new allocation to server',
    });
  }
});

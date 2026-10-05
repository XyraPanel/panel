import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and, isNull } from '#server/utils/drizzle';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';
import { recordServerActivity } from '#server/utils/server-activity';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Network'],
    summary: 'Assign a new allocation matching the primary IP',
    description:
      'Assigns a free allocation on the same node and IP as the server\'s current primary allocation, up to the server\'s allocation limit. Requires the server.allocation.create permission (owner/admin always allowed). Note: this route shares the same path as POST /network/allocations/index.post.ts; only one handler will actually be registered by Nitro.',
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
                    ip_alias: { type: 'string', nullable: true },
                    is_primary: { type: 'boolean' },
                    notes: { type: 'string', nullable: true },
                    assigned: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      '400': {
        description:
          'No allocation limit set, limit reached, server has no node/primary allocation, or no free allocations on the node',
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.allocation.create permission' },
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

  if (!server.allocationLimit) {
    throw createError({
      status: 400,
      message: 'Server does not have an allocation limit set',
    });
  }

  try {
    const db = useDrizzle();
    const currentAllocations = await db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.serverId, server.id));

    if (currentAllocations.length >= server.allocationLimit) {
      throw createError({
        status: 400,
        message: 'Server has reached its allocation limit',
      });
    }

    if (!server.nodeId) {
      throw createError({
        status: 400,
        message: 'Server is not assigned to a node',
      });
    }

    const primaryAllocation = currentAllocations.find((a) => a.id === server.allocationId);
    if (!primaryAllocation) {
      throw createError({
        status: 400,
        message: 'Server has no primary allocation',
      });
    }

    const [allocation] = await db
      .select()
      .from(tables.serverAllocations)
      .where(
        and(
          eq(tables.serverAllocations.nodeId, server.nodeId),
          eq(tables.serverAllocations.ip, primaryAllocation.ip),
          isNull(tables.serverAllocations.serverId),
        ),
      )
      .limit(1);

    if (!allocation) {
      throw createError({
        status: 400,
        message:
          'No available allocations on this node. Please contact an administrator to add more ports.',
      });
    }

    await db
      .update(tables.serverAllocations)
      .set({
        serverId: server.id,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.serverAllocations.id, allocation.id));

    const [updated] = await db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.id, allocation.id))
      .limit(1);

    if (!updated) {
      throw createError({
        status: 500,
        message: 'Failed to retrieve updated allocation',
      });
    }

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.allocation.created',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        allocationId: updated.id,
        ip: updated.ip,
        port: updated.port,
      },
    });

    await invalidateServerCaches({
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
    });

    return {
      data: {
        id: updated.id,
        ip: updated.ip,
        port: updated.port,
        ip_alias: updated.ipAlias,
        is_primary: updated.isPrimary,
        notes: updated.notes,
        assigned: true,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Server Allocation Create] Failed for server:', serverIdentifier, error);
    throw createError({
      status: 500,
      message: 'Failed to assign new allocation to server',
    });
  }
});

import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { requireServerPermission } from '#server/utils/permission-middleware';
import {
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
  requireAccountUser,
} from '#server/utils/security';
import { updateAllocationSchema } from '#shared/schema/server/subusers';
import { recordServerActivity } from '#server/utils/server-activity';

import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server Network'],
    summary: 'Update allocation notes',
    description:
      'Updates the notes field on a network allocation. Requires the server.allocation.update permission (owner/admin always allowed).',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'allocation', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              notes: { type: 'string', maxLength: 500, nullable: true },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Allocation updated',
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
      '400': { description: 'Invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.allocation.update permission' },
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
    requiredPermissions: ['server.allocation.update'],
    allowOwner: true,
    allowAdmin: true,
  });

  const body = await readValidatedBodyWithLimit(
    event,
    updateAllocationSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const { notes } = body;

  try {
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

    await db
      .update(tables.serverAllocations)
      .set({
        notes: notes || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.serverAllocations.id, allocationId));

    await recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.allocation.updated',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        allocationId,
        notes,
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
        notes: notes || null,
        isPrimary: Boolean(allocation.id === server.allocationId),
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Server Allocation Patch] Failed for server:', serverIdentifier, 'allocation:', allocationId, error);
    throw createError({
      status: 500,
      message: 'Failed to update allocation details',
    });
  }
});

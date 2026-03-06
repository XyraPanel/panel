import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { remoteServerInstallStatusSchema } from '#shared/schema/wings';

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Remote complete server install',
    description: 'Callback for Wings nodes to report the final status of a server installation or reinstallation process.',
    parameters: [
      {
        in: 'path',
        name: 'uuid',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'The UUID of the server',
      },
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              successful: { type: 'boolean' },
              reinstall: { type: 'boolean', default: false },
            },
            required: ['successful'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Status successfully processed',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    status: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: 'Missing server UUID' },
      401: { description: 'Unauthorized Wings node' },
      403: { description: 'Server not assigned to this node' },
      404: { description: 'Server not found' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  try {
  assertMethod(event, 'POST');
  const db = useDrizzle();
  const { uuid } = getRouterParams(event);

  if (!uuid || typeof uuid !== 'string') {
    throw createError({ status: 400, message: 'Missing server UUID' });
  }

  const nodeId = await getNodeIdFromAuth(event);

  const { successful, reinstall } = await readValidatedBodyWithLimit(
    event,
    remoteServerInstallStatusSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const serverRows = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1);

  const server = serverRows[0];

  if (!server) {
    throw createError({ status: 404, message: 'Server not found' });
  }

  if (server.nodeId !== nodeId) {
    throw createError({ status: 403, message: 'Server does not belong to this node' });
  }

  const newStatus = successful ? null : 'install_failed';
  const now = new Date().toISOString();

  const updatedFields: Partial<typeof tables.servers.$inferInsert> = {
    status: newStatus,
    updatedAt: now,
  };

  if (successful) {
    updatedFields.installedAt = now;
  }

  await db.update(tables.servers).set(updatedFields).where(eq(tables.servers.id, server.id));

  await recordAuditEventFromRequest(event, {
    actor: 'wings',
    actorType: 'system',
    action: successful ? 'server.install_completed' : 'server.install_failed',
    targetType: 'server',
    targetId: server.uuid,
    metadata: {
      node_id: nodeId,
      reinstall,
      successful,
    },
  });

  return {
    data: {
      success: true,
      status: newStatus,
    },
  };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const { logger } = await import('#server/utils/logger');
    logger.error('Unhandled API exception', error);
    throw createError({
      status: 500,
      message: 'Internal Server Error',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});

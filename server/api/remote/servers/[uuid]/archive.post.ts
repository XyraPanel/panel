import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEvent } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import type { ActivityAction } from '#shared/types/audit';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { remoteServerArchiveStatusSchema } from '#shared/schema/wings';

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Remote complete server archive',
    description: 'Callback for Wings nodes to report the final status of a server archiving operation.',
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
                    archived: { type: 'boolean' },
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
  const db = useDrizzle();
  const { uuid } = getRouterParams(event);

  if (!uuid || typeof uuid !== 'string') {
    throw createError({ status: 400, message: 'Missing server UUID' });
  }

  const nodeId = await getNodeIdFromAuth(event);

  const { successful } = await readValidatedBodyWithLimit(
    event,
    remoteServerArchiveStatusSchema,
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

  if (successful) {
    await db
      .update(tables.servers)
      .set({
        status: 'archived',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.servers.id, server.id));
  }

  await recordAuditEvent({
    actor: 'wings-daemon',
    actorType: 'daemon',
    action: (successful ? 'server.archive_success' : 'server.archive_failed') as ActivityAction,
    targetType: 'server',
    targetId: uuid,
    metadata: {
      status: successful ? 'success' : 'failed',
      archivedAt: new Date().toISOString(),
    },
  });

  return {
    data: {
      success: true,
      archived: successful,
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

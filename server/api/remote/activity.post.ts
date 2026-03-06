import { type H3Event } from 'h3';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { findServerByIdentifier } from '#server/utils/serversStore';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import type { ActivityAction } from '#shared/types/audit';
import { remoteActivityBatchSchema } from '#shared/schema/wings';
import { debugWarn, debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Remote activity batch',
    description: 'Receives and processes a batch of activity/audit logs from a remote Wings node. Used for centralized logging.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    event: { type: 'string', description: 'The action/event name' },
                    user: { type: 'string', nullable: true, description: 'The user identifier or system' },
                    server: { type: 'string', nullable: true, description: 'The server UUID or identifier' },
                    ip: { type: 'string', nullable: true, description: 'The client IP associated with the event' },
                    timestamp: { type: 'string', format: 'date-time' },
                    metadata: { type: 'object', nullable: true },
                  },
                },
              },
            },
            required: ['data'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Batch processed successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    received: { type: 'integer' },
                    processed: { type: 'integer' },
                    failed: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      401: { description: 'Missing or invalid authentication' },
      500: { description: 'Fatal processing error' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  await getNodeIdFromAuth(event);
  const { data: activities } = await readValidatedBodyWithLimit(
    event,
    remoteActivityBatchSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const insertedCount = activities.length;
    let successCount = 0;

    const serverCache = new Map<string, Awaited<ReturnType<typeof findServerByIdentifier>> | null>();

    for (const activity of activities) {
      try {
        if (!activity.event || !activity.timestamp) {
          debugWarn('Skipping invalid activity log:', activity);
          continue;
        }

        let resolvedServer = null;
        const serverKey = activity.server;

        if (serverKey) {
          if (!serverCache.has(serverKey)) {
            const serverRecord = await findServerByIdentifier(serverKey);
            serverCache.set(serverKey, serverRecord);
          }
          resolvedServer = serverCache.get(serverKey) ?? null;
        }

        await recordAuditEventFromRequest(event, {
          actor: activity.user || 'system',
          actorType: 'daemon',
          action: activity.event as ActivityAction,
          targetType: 'server',
          targetId: resolvedServer?.id ?? activity.server ?? null,
          metadata: {
            ...activity.metadata,
            serverUuid: resolvedServer?.uuid ?? activity.server ?? undefined,
            serverIdentifier: resolvedServer?.identifier ?? undefined,
            ip: activity.ip,
            wings_timestamp: activity.timestamp,
            source: 'wings',
          },
        });

        successCount++;
      } catch (error) {
        debugError('Failed to insert activity log:', error, activity);
      }
    }

    return {
      data: {
        success: true,
        received: insertedCount,
        processed: successCount,
        failed: insertedCount - successCount,
      },
    };
  } catch (error) {
    debugError('Fatal error in activity batch processing:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to process activity batch',
    });
  }
});

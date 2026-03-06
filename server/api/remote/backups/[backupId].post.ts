import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { invalidateServerBackupsCache } from '#server/utils/backups';
import { remoteBackupStatusSchema } from '#shared/schema/wings';
import { sendBackupCompletedEmail } from '#server/utils/email';

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Remote complete backup',
    description:
      'Callback for Wings nodes to report the final status of a server backup process, providing checksums and file sizes upon success.',
    parameters: [
      {
        in: 'path',
        name: 'backupId',
        required: true,
        schema: { type: 'string' },
        description: 'The UUID of the backup',
      },
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              successful: { type: 'boolean' },
              checksum: { type: 'string', description: 'The file checksum if successful' },
              checksum_type: { type: 'string', enum: ['sha1', 'sha256', 'md5'] },
              size: { type: 'integer', description: 'The final backup size in bytes' },
              parts: {
                type: 'array',
                items: { type: 'object' },
                description: 'S3 upload part details if applicable',
              },
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
                  properties: { success: { type: 'boolean' } },
                },
              },
            },
          },
        },
      },
      400: { description: 'Missing backup ID' },
      401: { description: 'Unauthorized Wings node' },
      404: { description: 'Backup not found' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  try {
    const db = useDrizzle();
    const { backupId } = getRouterParams(event);

    if (!backupId || typeof backupId !== 'string') {
      throw createError({ status: 400, message: 'Missing backup ID' });
    }

    const nodeId = await getNodeIdFromAuth(event);

    const { checksum, checksum_type, size, successful, parts } = await readValidatedBodyWithLimit(
      event,
      remoteBackupStatusSchema,
      BODY_SIZE_LIMITS.SMALL,
    );

    const backupRows = await db
      .select()
      .from(tables.serverBackups)
      .where(eq(tables.serverBackups.uuid, backupId))
      .limit(1);

    const backup = backupRows[0];

    if (!backup) {
      throw createError({ status: 404, message: 'Backup not found' });
    }

    const updates = {
      checksum: successful ? `${checksum_type}:${checksum}` : null,
      bytes: successful ? size : 0,
      completedAt: new Date().toISOString(),
      isSuccessful: successful,
      isLocked: successful ? backup.isLocked : false,
      updatedAt: new Date().toISOString(),
    };

    await db
      .update(tables.serverBackups)
      .set(updates)
      .where(eq(tables.serverBackups.id, backup.id));

    await invalidateServerBackupsCache(backup.serverId);

    const serverRows = await db
      .select({
        id: tables.servers.id,
        uuid: tables.servers.uuid,
        name: tables.servers.name,
        ownerId: tables.servers.ownerId,
      })
      .from(tables.servers)
      .where(eq(tables.servers.id, backup.serverId))
      .limit(1);

    const server = serverRows[0];

    if (successful && server?.ownerId) {
      try {
        const ownerRows = await db
          .select({ email: tables.users.email, username: tables.users.username })
          .from(tables.users)
          .where(eq(tables.users.id, server.ownerId))
          .limit(1);
        const owner = ownerRows[0];
        if (owner?.email && server.name) {
          await sendBackupCompletedEmail(owner.email, server.name, backup.name);
        }
      } catch {
        // Non-fatal — don't fail the callback if email sending fails
      }
    }

    await recordAuditEventFromRequest(event, {
      actor: 'wings',
      actorType: 'system',
      action: successful ? 'server:backup.complete' : 'server:backup.fail',
      targetType: 'backup',
      targetId: backupId,
      metadata: {
        node_id: nodeId,
        server_uuid: server?.uuid,
        checksum: successful ? `${checksum_type}:${checksum}` : undefined,
        size: successful ? size : 0,
        successful,
        parts: parts?.length || 0,
      },
    });

    return {
      data: {
        success: true,
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

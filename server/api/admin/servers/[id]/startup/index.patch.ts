import { randomUUID } from 'node:crypto';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { updateServerStartupSchema } from '~~/shared/schema/admin/server';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      message: 'Server ID is required',
    });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    updateServerStartupSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  const { startup, dockerImage, environment } = body;

  const db = useDrizzle();
  const { findServerByIdentifier } = await import('#server/utils/serversStore');
  const server = await findServerByIdentifier(identifier);

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  const serverId = server.id;

  const nowIso = new Date().toISOString();
  const serverUpdates: Record<string, unknown> = {
    updatedAt: nowIso,
  };

  if (startup !== undefined) {
    serverUpdates.startup = startup;
  }

  if (dockerImage !== undefined) {
    serverUpdates.dockerImage = dockerImage;
    serverUpdates.image = dockerImage;
  }

  if (Object.keys(serverUpdates).length > 1) {
    try {
      await db.update(tables.servers).set(serverUpdates).where(eq(tables.servers.id, serverId));

      const [updated] = await db
        .select()
        .from(tables.servers)
        .where(eq(tables.servers.id, serverId))
        .limit(1);

      if (!updated) {
        throw new Error('Server not found after update');
      }

      if (dockerImage !== undefined) {
        if (updated.dockerImage !== dockerImage) {
          throw new Error(
            `Failed to save dockerImage: expected "${dockerImage}", got "${updated.dockerImage}"`,
          );
        }
        if (updated.image !== dockerImage) {
          throw new Error(
            `Failed to save image: expected "${dockerImage}", got "${updated.image}"`,
          );
        }
      }

      if (startup !== undefined && updated.startup !== startup) {
        throw new Error(`Failed to save startup: expected "${startup}", got "${updated.startup}"`);
      }
    } catch (error) {
      throw createError({
        status: 500,
        message: 'Failed to save server configuration',
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  if (environment !== undefined) {
    await db.delete(tables.serverStartupEnv).where(eq(tables.serverStartupEnv.serverId, serverId));

    const envEntries = Object.entries(environment);

    if (envEntries.length > 0) {
      await db.insert(tables.serverStartupEnv).values(
        envEntries.map(([key, value]) => ({
          id: randomUUID(),
          serverId,
          key,
          value: String(value ?? ''),
          createdAt: nowIso,
          updatedAt: nowIso,
        })),
      );
    }
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.server.startup.updated',
    targetType: 'server',
    targetId: serverId,
    metadata: {
      serverUuid: server.uuid,
      updatedFields: Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined),
    },
  });

  return {
    data: {
      success: true,
      message: 'Startup configuration updated successfully',
    },
  };
});

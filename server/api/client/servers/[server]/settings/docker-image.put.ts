import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { recordServerActivity } from '#server/utils/server-activity';
import { serverDockerImageUpdateSchema } from '#shared/schema/server/operations';

export default defineEventHandler(async (event) => {
  const { user, session } = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.update'],
  });

  const { docker_image } = await readValidatedBodyWithLimit(
    event,
    serverDockerImageUpdateSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();
  const eggRows = await db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.id, server.eggId!))
    .limit(1);

  const [egg] = eggRows;

  if (!egg) {
    throw createError({
      status: 404,
      message: 'Egg not found',
    });
  }

  let eggDockerImages: Record<string, string> = {};
  if (egg.dockerImages) {
    try {
      eggDockerImages =
        typeof egg.dockerImages === 'string' ? JSON.parse(egg.dockerImages) : egg.dockerImages;
    } catch (e) {
      console.warn('[Docker Image PUT] Failed to parse egg dockerImages:', e);
    }
  }

  if (Object.keys(eggDockerImages).length === 0 && egg.dockerImage) {
    eggDockerImages = { [egg.name || 'Default']: egg.dockerImage };
  }

  const currentImage = server.dockerImage || server.image;
  const isInEggImages = Object.values(eggDockerImages).includes(currentImage || '');

  if (!isInEggImages && currentImage) {
    throw createError({
      status: 400,
      message:
        "This server's Docker image has been manually set by an administrator and cannot be updated.",
    });
  }

  const oldImage = server.dockerImage || server.image;

  await db
    .update(tables.servers)
    .set({
      dockerImage: docker_image,
      image: docker_image,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tables.servers.id, server.id));

  await Promise.all([
    recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.settings.docker_image.update',
      targetType: 'server',
      targetId: server.id,
      metadata: { oldImage, newImage: docker_image },
    }),
    recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.settings.docker_image.update',
      server: { id: server.id, uuid: server.uuid },
      metadata: { oldImage, newImage: docker_image },
    }),
  ]);

  return {
    data: {
      object: 'server',
      attributes: {
        docker_image,
      },
    },
  };
});

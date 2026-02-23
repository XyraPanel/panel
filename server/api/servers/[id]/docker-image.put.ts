import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { updateDockerImageSchema } from '#shared/schema/server/operations';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import { invalidateServerCaches } from '#server/utils/serversStore';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      status: 400,
      statusText: 'Missing server identifier',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['startup.update'],
  });

  const { dockerImage } = await readValidatedBodyWithLimit(
    event,
    updateDockerImageSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();

  const [egg] = server.eggId
    ? await db.select().from(tables.eggs).where(eq(tables.eggs.id, server.eggId)).limit(1)
    : [null];

  if (egg?.dockerImages) {
    let dockerImages: Record<string, string> = {};
    try {
      dockerImages =
        typeof egg.dockerImages === 'string' ? JSON.parse(egg.dockerImages) : egg.dockerImages;
    } catch (e) {
      console.warn('[Docker Image PUT] Failed to parse egg dockerImages:', e);
    }

    const validImages = Object.values(dockerImages);
    if (validImages.length > 0 && !validImages.includes(dockerImage)) {
      throw createError({
        status: 400,
        message: "This server's Docker image can only be changed to one from the egg's list.",
      });
    }
  }

  const previousDockerImage = server.dockerImage;
  const previousImage = server.image;

  await db
    .update(tables.servers)
    .set({
      dockerImage,
      image: dockerImage,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tables.servers.id, server.id));

  await invalidateServerCaches({
    id: server.id,
    uuid: server.uuid,
    identifier: server.identifier,
  });

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.settings.docker_image_updated',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      previousDockerImage,
      previousImage,
      dockerImage,
    },
  });

  return {
    data: {
      success: true,
      message: 'Docker image updated successfully. Restart your server for changes to take effect.',
    },
  };
});

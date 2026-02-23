import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { invalidateServerCaches } from '#server/utils/serversStore';
import { recordServerActivity } from '#server/utils/server-activity';
import { serverRenameSchema } from '#shared/schema/server/operations';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({ status: 400, statusText: 'Server ID required' });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(identifier, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.update'],
  });

  const body = await readValidatedBodyWithLimit(event, serverRenameSchema, BODY_SIZE_LIMITS.SMALL);

  const db = useDrizzle();
  await db
    .update(tables.servers)
    .set({
      name: body.name,
      description: body.description ?? server.description ?? null,
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
    action: 'server.settings.renamed',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      previousName: server.name,
      newName: body.name,
    },
  });

  return {
    data: {
      name: body.name,
      description: body.description ?? server.description ?? null,
    },
  };
});

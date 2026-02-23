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
import { serverClientRenameSchema } from '#shared/schema/server/operations';

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

  const { name, description } = await readValidatedBodyWithLimit(
    event,
    serverClientRenameSchema,
    BODY_SIZE_LIMITS.SMALL,
  );

  const db = useDrizzle();
  await db
    .update(tables.servers)
    .set({
      name,
      description: description || server.description,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tables.servers.id, server.id));

  const newDescription = description ?? server.description ?? null;

  await Promise.all([
    recordAuditEventFromRequest(event, {
      actor: user.id,
      actorType: 'user',
      action: 'server.settings.rename',
      targetType: 'server',
      targetId: server.id,
      metadata: {
        serverUuid: server.uuid,
        oldName: server.name,
        newName: name,
        description: newDescription,
      },
    }),
    recordServerActivity({
      event,
      actorId: user.id,
      action: 'server.settings.rename',
      server: { id: server.id, uuid: server.uuid },
      metadata: {
        oldName: server.name,
        newName: name,
        description: newDescription,
      },
    }),
  ]);

  return {
    data: {
      object: 'server',
      attributes: {
        name,
        description: newDescription,
      },
    },
  };
});

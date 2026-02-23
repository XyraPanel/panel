import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { getWingsClientForServer } from '#server/utils/wings-client';
import { z } from 'zod';

const changeEggSchema = z.object({
  eggId: z.string().min(1),
  nestId: z.string().min(1).optional(),
  reinstall: z.boolean().default(true),
  skipScripts: z.boolean().default(false),
  startOnCompletion: z.boolean().default(true),
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const serverId = getRouterParam(event, 'id');
  if (!serverId) {
    throw createError({ status: 400, message: 'Server ID is required' });
  }

  const body = await readValidatedBodyWithLimit(event, changeEggSchema, BODY_SIZE_LIMITS.SMALL);

  const db = useDrizzle();

  const [server] = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.id, serverId))
    .limit(1);

  if (!server) {
    throw createError({ status: 404, message: 'Server not found' });
  }

  const [egg] = await db.select().from(tables.eggs).where(eq(tables.eggs.id, body.eggId)).limit(1);

  if (!egg) {
    throw createError({ status: 404, message: 'Egg not found' });
  }

  const nowIso = new Date().toISOString();

  await db
    .update(tables.servers)
    .set({
      eggId: egg.id,
      nestId: body.nestId || egg.nestId,
      startup: egg.startup || server.startup,
      dockerImage: egg.dockerImage || server.dockerImage,
      skipScripts: body.skipScripts,
      ...(body.reinstall ? { status: 'installing', installedAt: null } : {}),
      updatedAt: nowIso,
    })
    .where(eq(tables.servers.id, server.id));

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.server.egg.changed',
    targetType: 'server',
    targetId: server.id,
    metadata: {
      serverUuid: server.uuid,
      previousEggId: server.eggId,
      newEggId: egg.id,
      eggName: egg.name,
      reinstall: body.reinstall,
    },
  });

  if (body.reinstall) {
    const { client } = await getWingsClientForServer(server.uuid);
    await client.reinstallServer(server.uuid);
  }

  return {
    data: {
      success: true,
      message: body.reinstall ? 'Egg changed and reinstall initiated' : 'Egg changed successfully',
      eggId: egg.id,
      eggName: egg.name,
    },
  };
});

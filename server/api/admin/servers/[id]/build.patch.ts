import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { serverBuildSchema } from '#shared/schema/admin/server';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PATCH');

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

  const body = await readValidatedBodyWithLimit(event, serverBuildSchema, BODY_SIZE_LIMITS.SMALL);
  const {
    cpu,
    memory,
    swap,
    disk,
    io,
    threads,
    oomDisabled,
    databaseLimit,
    allocationLimit,
    backupLimit,
  } = body;

  const db = useDrizzle();
  const { findServerByIdentifier, invalidateServerCaches } =
    await import('#server/utils/serversStore');
  const server = await findServerByIdentifier(identifier);

  if (!server) {
    throw createError({
      status: 404,
      message: 'Server not found',
    });
  }

  const serverId = server.id;
  const existingLimitsRows = await db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, serverId))
    .limit(1);

  const existingLimits = existingLimitsRows[0];

  const updateData = {
    cpu: typeof cpu === 'number' ? cpu : (existingLimits?.cpu ?? 100),
    memory: typeof memory === 'number' ? memory : (existingLimits?.memory ?? 512),
    swap: typeof swap === 'number' ? swap : (existingLimits?.swap ?? 0),
    disk: typeof disk === 'number' ? disk : (existingLimits?.disk ?? 1024),
    io: typeof io === 'number' ? io : (existingLimits?.io ?? 500),
    threads: threads !== undefined ? threads : (existingLimits?.threads ?? null),
    databaseLimit:
      databaseLimit !== undefined ? databaseLimit : (existingLimits?.databaseLimit ?? null),
    allocationLimit:
      allocationLimit !== undefined ? allocationLimit : (existingLimits?.allocationLimit ?? null),
    backupLimit: backupLimit !== undefined ? backupLimit : (existingLimits?.backupLimit ?? 0),
    updatedAt: new Date().toISOString() as string,
  };

  if (existingLimits) {
    await db
      .update(tables.serverLimits)
      .set(updateData)
      .where(eq(tables.serverLimits.serverId, serverId));
  } else {
    const nowIso = new Date().toISOString();
    await db.insert(tables.serverLimits).values({
      serverId,
      cpu: cpu ?? 100,
      memory: memory ?? 512,
      swap: swap ?? 0,
      disk: disk ?? 1024,
      io: io ?? 500,
      threads: threads ?? null,
      databaseLimit: databaseLimit ?? null,
      allocationLimit: allocationLimit ?? null,
      backupLimit: backupLimit ?? 0,
      memoryOverallocate: null,
      diskOverallocate: null,
      oomDisabled: server.oomDisabled ?? true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  if (oomDisabled !== undefined) {
    await db
      .update(tables.servers)
      .set({ oomDisabled: Boolean(oomDisabled) })
      .where(eq(tables.servers.id, serverId));
  }

  await invalidateServerCaches({
    id: server.id,
    uuid: server.uuid,
    identifier: server.identifier,
  });

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.server.build.updated',
    targetType: 'server',
    targetId: serverId,
    metadata: {
      serverUuid: server.uuid,
      updatedFields: Object.keys(body),
    },
  });

  const { getWingsClientForServer } = await import('#server/utils/wings-client');
  const result = await getWingsClientForServer(server.uuid);
  const { client } = result;

  try {
    await client.syncServer(server.uuid);
  } catch (syncError) {
    throw createError({
      status: 500,
      message: `Database updated successfully, but failed to sync with Wings: ${syncError instanceof Error ? syncError.message : String(syncError)}. The changes will be applied on next server restart.`,
      data: {
        databaseUpdated: true,
        wingsSyncFailed: true,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      },
    });
  }

  return {
    data: {
      success: true,
      message: 'Build configuration updated successfully',
      serverId,
    },
  };
});

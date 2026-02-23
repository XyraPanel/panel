import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { requireRouteParam } from '#server/utils/http/params';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { serverBuildSchema } from '#shared/schema/admin/server';

export default defineEventHandler(async (event) => {
  assertMethod(event, 'PATCH');

  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.SERVERS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const serverId = await requireRouteParam(event, 'id', 'Server ID required');
  const body = await readValidatedBodyWithLimit(event, serverBuildSchema, BODY_SIZE_LIMITS.SMALL);
  const db = useDrizzle();

  const { findServerByIdentifier, invalidateServerCaches } =
    await import('#server/utils/serversStore');
  const server = await findServerByIdentifier(serverId);

  if (!server) {
    throw createError({ status: 404, message: 'Server not found' });
  }

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

  const existingLimitsRows = await db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, serverId))
    .limit(1);

  const existingLimits = existingLimitsRows[0];

  const updateData = {
    cpu: typeof cpu === 'number' ? cpu : (existingLimits?.cpu ?? 0),
    memory: typeof memory === 'number' ? memory : (existingLimits?.memory ?? 0),
    swap: typeof swap === 'number' ? swap : (existingLimits?.swap ?? 0),
    disk: typeof disk === 'number' ? disk : (existingLimits?.disk ?? 0),
    io: typeof io === 'number' ? io : (existingLimits?.io ?? 500),
    threads: threads !== undefined ? threads : (existingLimits?.threads ?? null),
    databaseLimit:
      databaseLimit !== undefined ? databaseLimit : (existingLimits?.databaseLimit ?? null),
    allocationLimit:
      allocationLimit !== undefined ? allocationLimit : (existingLimits?.allocationLimit ?? null),
    backupLimit: backupLimit !== undefined ? backupLimit : (existingLimits?.backupLimit ?? null),
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
      cpu: cpu ?? 0,
      memory: memory ?? 0,
      swap: swap ?? 0,
      disk: disk ?? 0,
      io: io ?? 500,
      threads: threads ?? null,
      databaseLimit: databaseLimit ?? null,
      allocationLimit: allocationLimit ?? null,
      backupLimit: backupLimit ?? null,
      memoryOverallocate: null,
      diskOverallocate: null,
      oomDisabled: server.oomDisabled ?? true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  const serverUpdates: Record<string, unknown> = {};
  if (oomDisabled !== undefined) serverUpdates.oomDisabled = Boolean(oomDisabled);
  if (allocationLimit !== undefined) serverUpdates.allocationLimit = allocationLimit;
  if (databaseLimit !== undefined) serverUpdates.databaseLimit = databaseLimit;
  if (backupLimit !== undefined) serverUpdates.backupLimit = backupLimit;

  if (Object.keys(serverUpdates).length > 0) {
    await db.update(tables.servers).set(serverUpdates).where(eq(tables.servers.id, serverId));
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
    },
  };
});

import { eq } from 'drizzle-orm';
import type { SettingsData } from '#shared/types/server';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverIdentifier = getRouterParam(event, 'server');

  if (!serverIdentifier) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverIdentifier, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
  });

  const db = useDrizzle();
  const limitsRow = await db
    .select({
      cpu: tables.serverLimits.cpu,
      memory: tables.serverLimits.memory,
      disk: tables.serverLimits.disk,
      swap: tables.serverLimits.swap,
      io: tables.serverLimits.io,
      threads: tables.serverLimits.threads,
      oomDisabled: tables.serverLimits.oomDisabled,
      databaseLimit: tables.serverLimits.databaseLimit,
      allocationLimit: tables.serverLimits.allocationLimit,
      backupLimit: tables.serverLimits.backupLimit,
    })
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .limit(1);

  const [limitsResult] = limitsRow;

  const response: SettingsData = {
    server: {
      id: server.id,
      uuid: server.uuid,
      identifier: server.identifier,
      name: server.name,
      description: server.description,
      suspended: Boolean(server.suspended),
    },
    limits: limitsResult
      ? {
          cpu: limitsResult.cpu,
          memory: limitsResult.memory,
          disk: limitsResult.disk,
          swap: limitsResult.swap,
          io: limitsResult.io,
          threads: limitsResult.threads ?? null,
          oomDisabled: limitsResult.oomDisabled ?? true,
          databaseLimit: limitsResult.databaseLimit ?? null,
          allocationLimit: limitsResult.allocationLimit ?? null,
          backupLimit: limitsResult.backupLimit ?? null,
        }
      : null,
  };

  return {
    data: response,
  };
});

import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { requireAccountUser } from '#server/utils/security';
import { getServerWithAccess } from '#server/utils/server-helpers';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { WingsServerConfiguration } from '#shared/types/wings-config';

export default defineEventHandler(async (event) => {
  const uuid = getRouterParam(event, 'uuid');
  if (!uuid) {
    throw createError({
      status: 400,
      message: 'Server UUID is required',
    });
  }

  const { user, session } = await requireAccountUser(event);
  const { server } = await getServerWithAccess(uuid, session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
  });

  const db = useDrizzle();

  const limitsRows = await db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .limit(1);

  const limits = limitsRows[0];

  let primaryAllocation = null;
  if (server.allocationId) {
    const allocRows = await db
      .select()
      .from(tables.serverAllocations)
      .where(eq(tables.serverAllocations.id, server.allocationId))
      .limit(1);
    primaryAllocation = allocRows[0] ?? null;
  }

  const allocations = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id));

  const envVars = await db
    .select()
    .from(tables.serverStartupEnv)
    .where(eq(tables.serverStartupEnv.serverId, server.id));

  let egg = null;
  if (server.eggId) {
    const eggRows = await db
      .select()
      .from(tables.eggs)
      .where(eq(tables.eggs.id, server.eggId))
      .limit(1);
    egg = eggRows[0] ?? null;
  }

  const environment: Record<string, string> = {};
  for (const envVar of envVars) {
    environment[envVar.key] = envVar.value;
  }

  const allocationMappings: Record<string, number[]> = {};
  for (const alloc of allocations) {
    if (!allocationMappings[alloc.ip]) {
      allocationMappings[alloc.ip] = [];
    }
    const mapping = allocationMappings[alloc.ip];
    if (mapping) {
      mapping.push(alloc.port);
    }
  }

  const config: WingsServerConfiguration = {
    uuid: server.uuid,
    meta: {
      name: server.name,
      description: server.description || '',
    },
    suspended: server.suspended,
    invocation: server.startup || '',
    skip_egg_scripts: server.skipScripts,
    environment,
    labels: {
      Service: 'XyraPanel',
      ContainerType: 'server_process',
    },
    allocations: {
      force_outgoing_ip: false,
      default: {
        ip: primaryAllocation?.ip || '0.0.0.0',
        port: primaryAllocation?.port || 25565,
      },
      mappings: allocationMappings,
    },
    build: {
      memory_limit: limits?.memory || 512,
      swap: limits?.swap || 0,
      io_weight: limits?.io || 500,
      cpu_limit: limits?.cpu || 100,
      threads: limits?.threads || '',
      disk_space: limits?.disk || 1024,
      oom_disabled: limits?.oomDisabled ?? true,
    },
    crash_detection_enabled: true,
    mounts: [],
    egg: {
      id: egg?.uuid || '',
      file_denylist: [],
    },
    container: {
      image: server.image || egg?.dockerImage || 'ghcr.io/pterodactyl/yolks:java_21',
    },
  };

  await recordAuditEventFromRequest(event, {
    actor: user.id,
    actorType: 'user',
    action: 'server.configuration.requested',
    targetType: 'server',
    targetId: server.id,
  });

  return config;
});

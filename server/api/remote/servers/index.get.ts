import { type H3Event } from 'h3';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { toWingsHttpError } from '#server/utils/wings/http';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { sql } from 'drizzle-orm';
import { remoteServersPaginationSchema } from '#shared/schema/wings';

function safeJsonParse(value: string | null | undefined, defaultValue: unknown = {}): unknown {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return defaultValue;
  }
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

export default defineEventHandler(async (event: H3Event) => {
  try {
    const nodeId = await getNodeIdFromAuth(event);
    const query = getQuery(event);
    const parsedQuery = remoteServersPaginationSchema.safeParse({
      page: query.page,
      per_page: query.per_page,
    });

    if (!parsedQuery.success) {
      const errors = parsedQuery.error.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
      }));
      throw createError({
        status: 400,
        statusText: 'Invalid pagination parameters',
        data: { errors },
      });
    }

    const { page, per_page: perPage } = parsedQuery.data;

    const db = useDrizzle();
    const offset = page * perPage;

    const servers = await db
      .select()
      .from(tables.servers)
      .where(eq(tables.servers.nodeId, nodeId))
      .limit(perPage)
      .offset(offset);

    const [total] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tables.servers)
      .where(eq(tables.servers.nodeId, nodeId))
      .limit(1);

    const totalCount = Number(total?.count ?? 0);

    const serverConfigs = await Promise.all(
      servers.map(async (server) => {
        try {
          const allAllocations = await db
            .select()
            .from(tables.serverAllocations)
            .where(eq(tables.serverAllocations.serverId, server.id));

          const primaryAllocation = allAllocations.find((a) => a.isPrimary);
          const allocations = allAllocations;

          const [limits] = await db
            .select()
            .from(tables.serverLimits)
            .where(eq(tables.serverLimits.serverId, server.id))
            .limit(1);

          let egg: typeof tables.eggs.$inferSelect | null = null;
          if (server.eggId) {
            const [eggRow] = await db
              .select()
              .from(tables.eggs)
              .where(eq(tables.eggs.id, server.eggId))
              .limit(1);
            egg = eggRow ?? null;
          }

          const envVars = await db
            .select()
            .from(tables.serverStartupEnv)
            .where(eq(tables.serverStartupEnv.serverId, server.id));

          const serverEnvMap = new Map<string, string>();
          for (const envVar of envVars) {
            serverEnvMap.set(envVar.key, envVar.value || '');
          }

          const environment: Record<string, string> = {
            STARTUP: egg?.startup || server.startup || '',
          };

          if (egg?.id) {
            const eggVariables = await db
              .select()
              .from(tables.eggVariables)
              .where(eq(tables.eggVariables.eggId, egg.id));

            for (const eggVar of eggVariables) {
              const value = serverEnvMap.get(eggVar.envVariable) ?? eggVar.defaultValue ?? '';
              if (value) {
                environment[eggVar.envVariable] = value;
              }
            }
          }

          for (const [key, value] of serverEnvMap.entries()) {
            if (!environment[key] && value) {
              environment[key] = value;
            }
          }

          environment.SERVER_MEMORY = String(limits?.memory ?? 512);
          if (primaryAllocation) {
            environment.SERVER_IP = primaryAllocation.ip;
            environment.SERVER_PORT = String(primaryAllocation.port);
          }

          const allocationMappings: Record<string, { ip: string; port: number }> = {};
          for (const alloc of allocations) {
            if (!alloc.isPrimary) {
              allocationMappings[`${alloc.ip}:${alloc.port}`] = {
                ip: alloc.ip,
                port: alloc.port,
              };
            }
          }

          const settings = {
            uuid: server.uuid,
            suspended: server.suspended || false,
            environment,
            invocation: egg?.startup || server.startup || '',
            skip_egg_scripts: false,
            build: {
              memory_limit: limits?.memory ?? 512,
              swap: 0,
              io_weight: limits?.io ?? 500,
              cpu_limit: limits?.cpu ?? 100,
              threads: limits?.threads || null,
              disk_space: limits?.disk ?? 1024,
              oom_disabled: limits?.oomDisabled ?? true,
            },
            container: {
              image:
                server.dockerImage ||
                egg?.dockerImage ||
                server.image ||
                'ghcr.io/pterodactyl/yolks:java_17',
              oom_disabled: limits?.oomDisabled ?? true,
              requires_rebuild: false,
            },
            allocations: {
              default: primaryAllocation
                ? {
                    ip: primaryAllocation.ip,
                    port: primaryAllocation.port,
                  }
                : {
                    ip: '0.0.0.0',
                    port: 25565,
                  },
              mappings: allocationMappings,
            },
            mounts: [],
            egg: {
              id: server.eggId || '',
              file_denylist: [],
            },
          };

          const startupDone = egg?.startup || server.startup || '';
          const startupDoneArray = startupDone
            ? typeof startupDone === 'string'
              ? [startupDone]
              : Array.isArray(startupDone)
                ? startupDone
                : []
            : [];

          const processConfiguration = {
            configs: [],
            startup: {
              done: startupDoneArray,
              user_interaction: [],
              strip_ansi: false,
            },
            stop: {
              type: 'command',
              value: '^C',
            },
            logs: {},
            file_denylist: [],
            config_stop: safeJsonParse(egg?.configStop, null),
            config_logs: safeJsonParse(egg?.configLogs, null),
            config_files: safeJsonParse(egg?.configFiles, {}),
            config_startup: safeJsonParse(egg?.configStartup, {}),
            egg_id: server.eggId || '',
          };

          return {
            uuid: server.uuid,
            settings,
            process_configuration: processConfiguration,
          };
        } catch (serverError) {
          console.error(`[Remote Servers] Error processing server ${server.uuid}:`, serverError);
          throw serverError;
        }
      }),
    );

    const totalPages = Math.ceil(totalCount / perPage);
    const from = offset + 1; // 1-indexed
    const to = Math.min(offset + servers.length, totalCount);

    return {
      data: serverConfigs,
      meta: {
        current_page: page,
        from: totalCount > 0 ? from : 0,
        last_page: totalPages,
        per_page: perPage,
        to: totalCount > 0 ? to : 0,
        total: totalCount,
      },
    };
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'list servers', nodeId: undefined });
  }
});

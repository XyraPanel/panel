import { type H3Event } from 'h3';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { debugError, debugWarn } from '#server/utils/logger';

function safeJsonParse(value: string | null | undefined, defaultValue: unknown = {}): unknown {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return defaultValue;
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') {
      const trimmed = parsed.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return JSON.parse(parsed);
        } catch {
          return parsed;
        }
      }
      return parsed;
    }
    return parsed;
  } catch (error) {
    debugWarn(
      `[Wings Config] safeJsonParse failed:`,
      error instanceof Error ? error.message : String(error),
      `Value:`,
      value.substring(0, 100),
    );
    return defaultValue;
  }
}

export default defineEventHandler(async (event: H3Event) => {
  const { uuid } = event.context.params ?? {};
  if (!uuid || typeof uuid !== 'string') {
    throw createError({ status: 400, statusText: 'Missing server UUID' });
  }

  const nodeId = await getNodeIdFromAuth(event);

  const db = useDrizzle();

  const [server] = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1);

  if (!server) {
    throw createError({ status: 404, statusText: 'Server not found' });
  }

  if (server.nodeId !== nodeId) {
    throw createError({
      status: 403,
      statusText: 'Forbidden',
      message: 'This server is not assigned to your node',
    });
  }

  const allAllocations = await db
    .select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.serverId, server.id));

  const primaryAllocation = allAllocations.find((a) => a.isPrimary);

  if (!primaryAllocation) {
    debugError(`[Wings Config] Server ${uuid} has no primary allocation`);
    throw createError({
      status: 500,
      statusText: 'Server configuration error',
      message: 'Server is missing a primary allocation',
    });
  }

  const limitsRows = await db
    .select()
    .from(tables.serverLimits)
    .where(eq(tables.serverLimits.serverId, server.id))
    .limit(1);

  const limits = limitsRows[0];

  let egg = null;
  if (server.eggId) {
    const eggRows = await db
      .select()
      .from(tables.eggs)
      .where(eq(tables.eggs.id, server.eggId))
      .limit(1);
    egg = eggRows[0] ?? null;
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

  const allocationMappings: Record<string, number[]> = {};
  for (const alloc of allAllocations) {
    const ipKey = alloc.ip?.trim();
    if (!ipKey) {
      continue;
    }
    if (!allocationMappings[ipKey]) {
      allocationMappings[ipKey] = [];
    }
    allocationMappings[ipKey].push(alloc.port);
  }

  const limitsWithDefaults = limits
    ? {
        cpu: limits.cpu ?? 100,
        memory: limits.memory ?? 512,
        swap: 0,
        disk: limits.disk ?? 1024,
        io: limits.io ?? 500,
        threads: limits.threads,
        oomDisabled: limits.oomDisabled ?? true,
        databaseLimit: limits.databaseLimit,
        allocationLimit: limits.allocationLimit,
        backupLimit: limits.backupLimit,
      }
    : {
        cpu: 0,
        memory: 512,
        swap: 0,
        disk: 1024,
        io: 500,
        threads: null,
        oomDisabled: true,
        databaseLimit: null,
        allocationLimit: null,
        backupLimit: null,
      };

  if (!egg) {
    debugError(`[Wings Config] Server ${uuid} has no egg configured`);
    throw createError({
      status: 500,
      statusText: 'Server configuration error',
      message: 'Server is missing egg configuration',
    });
  }

  const settings = {
    uuid: server.uuid,
    meta: {
      name: server.name,
      description: server.description || '',
    },
    suspended: Boolean(server.suspended),
    invocation: egg.startup || server.startup || '',
    skip_egg_scripts: Boolean(server.skipScripts),
    environment,
    labels: {},
    allocations: {
      force_outgoing_ip: false,
      default: {
        ip: primaryAllocation.ip,
        port: primaryAllocation.port,
      },
      mappings: allocationMappings,
    },
    build: {
      memory_limit: limitsWithDefaults.memory,
      swap: limitsWithDefaults.swap,
      io_weight: limitsWithDefaults.io,
      cpu_limit: limitsWithDefaults.cpu,
      threads: limitsWithDefaults.threads ? String(limitsWithDefaults.threads) : null,
      disk_space: limitsWithDefaults.disk,
      oom_disabled: Boolean(limitsWithDefaults.oomDisabled),
    },
    crash_detection_enabled: true,
    mounts: [],
    egg: {
      id: egg?.uuid || server.eggId || '',
      file_denylist: [],
    },
    container: (() => {
      const selectedImage =
        server.dockerImage ||
        egg?.dockerImage ||
        server.image ||
        'ghcr.io/pterodactyl/yolks:latest';

      if (server.dockerImage && server.dockerImage !== selectedImage) {
        debugWarn('[Wings Config] WARNING: server.dockerImage exists but was not selected!', {
          serverDockerImage: server.dockerImage,
          selectedImage,
        });
      }

      return {
        image: selectedImage,
        oom_disabled: Boolean(limitsWithDefaults.oomDisabled),
        requires_rebuild: false,
      };
    })(),
  };

  const serverStructure = {
    build: {
      default: {
        ip: primaryAllocation.ip,
        port: primaryAllocation.port,
      },
      memory: limitsWithDefaults.memory,
      swap: limitsWithDefaults.swap,
      io: limitsWithDefaults.io,
      cpu: limitsWithDefaults.cpu,
      threads: limitsWithDefaults.threads,
      disk: limitsWithDefaults.disk,
      env: environment,
    },
  };

  function replaceTemplateVariables(value: unknown, structure: typeof serverStructure): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const templateRegex = /{{([\w.-]+)}}/g;
    let result = value;
    const matches = Array.from(value.matchAll(templateRegex));

    for (const match of matches) {
      const key = match[1] ?? '';
      if (!key) {
        continue;
      }
      let replacement: unknown = '';

      if (key.startsWith('server.')) {
        const path = key.replace(/^server\./, '').split('.');
        let current: Record<string, unknown> | null = structure as unknown as Record<
          string,
          unknown
        >;
        for (const part of path) {
          if (!current || typeof current !== 'object') {
            current = null;
            break;
          }
          current = (current[part] as Record<string, unknown> | null) ?? null;
        }
        replacement = current ?? '';
      } else if (key.startsWith('env.')) {
        const envKey = key.replace(/^env\./, '');
        replacement = structure.build?.env?.[envKey] ?? '';
      } else if (key.startsWith('config.')) {
        continue;
      }

      if (replacement !== null && replacement !== undefined) {
        result = result.replace(match[0], String(replacement));
      }
    }

    return result;
  }

  function processFindValues(findData: unknown, structure: typeof serverStructure): unknown {
    if (typeof findData === 'string') {
      return replaceTemplateVariables(findData, structure);
    }

    if (Array.isArray(findData)) {
      return findData.map((item) => processFindValues(item, structure));
    }

    if (findData && typeof findData === 'object') {
      const processed: Record<string, unknown> = {};
      for (const [entryKey, entryValue] of Object.entries(findData as Record<string, unknown>)) {
        processed[entryKey] = processFindValues(entryValue, structure);
      }
      return processed;
    }

    return findData;
  }

  const configFiles = egg?.configFiles ? safeJsonParse(egg.configFiles, {}) : {};
  const configs: Array<{
    file: string;
    parser: string;
    replace: Array<{
      match: string;
      replace_with: string | number;
      if_value?: string;
    }>;
  }> = [];

  if (configFiles && typeof configFiles === 'object' && !Array.isArray(configFiles)) {
    for (const [file, data] of Object.entries(configFiles)) {
      if (data && typeof data === 'object' && 'parser' in data) {
        const fileData = data as { parser: string; find?: Record<string, unknown> };
        const replace: Array<{
          match: string;
          replace_with: string | number;
          if_value?: string;
        }> = [];

        if (fileData.find && typeof fileData.find === 'object') {
          const processedFind = processFindValues(fileData.find, serverStructure) as Record<
            string,
            unknown
          >;

          for (const [match, replaceValue] of Object.entries(processedFind)) {
            if (replaceValue && typeof replaceValue === 'object' && !Array.isArray(replaceValue)) {
              for (const [ifValue, replaceWith] of Object.entries(replaceValue)) {
                replace.push({
                  match,
                  if_value: ifValue,
                  replace_with: typeof replaceWith === 'number' ? replaceWith : String(replaceWith),
                });
              }
            } else {
              replace.push({
                match,
                replace_with:
                  typeof replaceValue === 'number' ? replaceValue : String(replaceValue),
              });
            }
          }
        }

        configs.push({
          file,
          parser: fileData.parser,
          replace,
        });
      }
    }
  }

  const configStartup = egg?.configStartup ? safeJsonParse(egg.configStartup, {}) : {};
  let startupDone: string[] = [];

  if (configStartup && typeof configStartup === 'object' && 'done' in configStartup) {
    const doneValue = (configStartup as { done: unknown }).done;
    if (Array.isArray(doneValue)) {
      startupDone = doneValue.filter((v): v is string => typeof v === 'string');
    } else if (typeof doneValue === 'string') {
      startupDone = [doneValue];
    }
  }

  if (startupDone.length === 0 && (egg?.startup || server.startup)) {
    startupDone = [egg?.startup || server.startup || ''];
  }

  const configStop = (typeof egg?.configStop === 'string' ? egg.configStop : null) || '^C';
  const stopType = configStop.startsWith('^') ? 'signal' : 'command';
  const stopValue = configStop.startsWith('^') ? configStop.substring(1).toUpperCase() : configStop;

  const processConfiguration = {
    startup: {
      done: startupDone,
      user_interaction: [],
      strip_ansi: false,
    },
    stop: {
      type: stopType,
      value: stopValue,
    },
    configs,
  };

  return {
    settings,
    process_configuration: processConfiguration,
  };
});

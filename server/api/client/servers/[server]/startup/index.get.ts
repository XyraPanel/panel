import { getServerWithAccess } from '#server/utils/server-helpers';
import { logger } from '#server/utils/logger';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import type { ServerStartupVariable } from '#shared/types/server';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Get startup command and environment variables',
    description:
      'Returns the resolved startup command, available Docker images, environment variables, and editable startup variables (merged from the server\'s egg and per-server overrides). Requires the server.settings.read permission (or server owner/admin).',
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    responses: {
      '200': {
        description: 'Startup configuration',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    startup: { type: 'string' },
                    dockerImage: { type: 'string' },
                    dockerImages: { type: 'object', additionalProperties: { type: 'string' } },
                    environment: { type: 'object', additionalProperties: { type: 'string' } },
                    variables: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          serverId: { type: 'integer' },
                          key: { type: 'string' },
                          value: { type: 'string' },
                          description: { type: 'string', nullable: true },
                          isEditable: { type: 'boolean' },
                          createdAt: { type: 'string' },
                          updatedAt: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Server identifier is missing' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Missing server.settings.read permission' },
      '404': { description: 'Server not found or not accessible' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.read'],
    allowOwner: true,
    allowAdmin: true,
  });

  const db = useDrizzle();

  let egg: typeof tables.eggs.$inferSelect | null = null;
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

  const environment: Record<string, string> = {};
  const variableRecords = new Map<string, (typeof envVars)[number]>();
  for (const envVar of envVars) {
    variableRecords.set(envVar.key, envVar);
  }

  const variables: ServerStartupVariable[] = [];

  if (egg?.id) {
    const eggVariables = await db
      .select()
      .from(tables.eggVariables)
      .where(eq(tables.eggVariables.eggId, egg.id));

    for (const eggVar of eggVariables) {
      const variableValue = serverEnvMap.get(eggVar.envVariable) ?? eggVar.defaultValue ?? '';
      environment[eggVar.envVariable] = variableValue;

      const override = variableRecords.get(eggVar.envVariable);
      variables.push({
        id: override?.id ?? `env_${server.id}_${eggVar.envVariable}`,
        serverId: server.id,
        key: eggVar.envVariable,
        value: variableValue,
        description: eggVar.description ?? override?.description ?? null,
        isEditable: Boolean(eggVar.userEditable ?? override?.isEditable ?? true),
        createdAt: new Date(override?.createdAt ?? server.createdAt ?? Date.now()).toISOString(),
        updatedAt: new Date(override?.updatedAt ?? server.updatedAt ?? Date.now()).toISOString(),
      });
    }
  }

  for (const [key, value] of serverEnvMap.entries()) {
    if (!environment[key]) {
      environment[key] = value;
    }

    if (!variables.some((variable) => variable.key === key)) {
      const override = variableRecords.get(key);
      variables.push({
        id: override?.id ?? `env_${server.id}_${key}`,
        serverId: server.id,
        key,
        value,
        description: override?.description ?? null,
        isEditable: override?.isEditable ?? true,
        createdAt: new Date(override?.createdAt ?? server.createdAt ?? Date.now()).toISOString(),
        updatedAt: new Date(override?.updatedAt ?? server.updatedAt ?? Date.now()).toISOString(),
      });
    }
  }

  let dockerImages: Record<string, string> = {};
  if (egg?.dockerImages) {
    try {
      dockerImages =
        typeof egg.dockerImages === 'string' ? JSON.parse(egg.dockerImages) : egg.dockerImages;
    } catch (error) {
      logger.warn('[client/startup] Failed to parse egg dockerImages:', error);
    }
  }

  if (Object.keys(dockerImages).length === 0 && egg?.dockerImage) {
    dockerImages = { [egg.name || 'Default']: egg.dockerImage };
  }

  return {
    data: {
      startup: server.startup || egg?.startup || '',
      dockerImage: server.dockerImage || server.image || egg?.dockerImage || '',
      dockerImages,
      environment,
      variables,
    },
  };
});

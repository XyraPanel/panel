import { getServerWithAccess } from '#server/utils/server-helpers';
import { useDrizzle, tables, eq, and } from '#server/utils/drizzle';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { recordServerActivity } from '#server/utils/server-activity';
import {
  requireAccountUser,
  readValidatedBodyWithLimit,
  BODY_SIZE_LIMITS,
} from '#server/utils/security';
import { serverStartupVariableSchema } from '#shared/schema/server/operations';
import { validateEggVariableValue } from '#server/utils/egg-variable-rules';

defineRouteMeta({
  openAPI: {
    tags: ['Client - Server'],
    summary: 'Update a startup environment variable',
    description:
      "Updates the value of one of the server's egg startup variables, validated against the egg variable's rules. Requires the server.settings.update permission (or server owner/admin). The variable must be marked user-editable on its egg.",
    parameters: [
      { name: 'server', in: 'path', required: true, schema: { type: 'string' }, description: 'Server identifier or UUID' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['key'],
            properties: {
              key: { type: 'string', description: 'Egg environment variable name' },
              value: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Variable updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    object: { type: 'string' },
                    attributes: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        description: { type: 'string', nullable: true },
                        env_variable: { type: 'string' },
                        default_value: { type: 'string', nullable: true },
                        server_value: { type: 'string' },
                        is_editable: { type: 'boolean' },
                        rules: { type: 'string' },
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
      '403': { description: 'Missing permission, or variable is not user-editable' },
      '404': { description: 'Server or variable not found' },
      '422': { description: 'Value fails the variable\'s validation rules' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const accountContext = await requireAccountUser(event);
  const { server, user } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['server.settings.update'],
    allowOwner: true,
    allowAdmin: true,
  });

  const { key, value } = await readValidatedBodyWithLimit(
    event,
    serverStartupVariableSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const normalizedValue = value ?? '';

  const db = useDrizzle();
  const eggVariableRows = await db
    .select()
    .from(tables.eggVariables)
    .where(
      and(eq(tables.eggVariables.eggId, server.eggId!), eq(tables.eggVariables.envVariable, key)),
    )
    .limit(1);

  const [eggVariable] = eggVariableRows;

  if (!eggVariable) {
    throw createError({
      status: 404,
      message: 'Variable not found',
    });
  }

  if (!eggVariable.userEditable) {
    throw createError({
      status: 403,
      message: 'This variable cannot be edited',
    });
  }

  const validation = validateEggVariableValue(eggVariable.rules, normalizedValue);
  if (!validation.valid) {
    throw createError({
      status: 422,
      message: validation.error || 'Invalid value for this variable',
    });
  }

  const existingVarRows = await db
    .select()
    .from(tables.serverEnvironmentVariables)
    .where(
      and(
        eq(tables.serverEnvironmentVariables.serverId, server.id),
        eq(tables.serverEnvironmentVariables.key, key),
      ),
    )
    .limit(1);

  const [existingVar] = existingVarRows;

  const now = new Date().toISOString();

  if (existingVar) {
    await db
      .update(tables.serverEnvironmentVariables)
      .set({
        value: normalizedValue,
        updatedAt: now,
      })
      .where(eq(tables.serverEnvironmentVariables.id, existingVar.id));
  } else {
    await db.insert(tables.serverEnvironmentVariables).values({
      id: `env_${Date.now()}`,
      serverId: server.id,
      key,
      value: normalizedValue,
      createdAt: now,
      updatedAt: now,
    });
  }

  await recordServerActivity({
    event,
    actorId: user.id,
    action: 'server.startup_variable.updated',
    server: { id: server.id, uuid: server.uuid },
    metadata: {
      key,
    },
  });

  return {
    data: {
      object: 'egg_variable',
      attributes: {
        name: eggVariable.name,
        description: eggVariable.description,
        env_variable: eggVariable.envVariable,
        default_value: eggVariable.defaultValue,
        server_value: normalizedValue,
        is_editable: eggVariable.userEditable,
        rules: eggVariable.rules || '',
      },
    },
  };
  } catch (error) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const { logger } = await import('#server/utils/logger');
    logger.error('Unhandled API exception', error);
    throw createError({
      status: 500,
      message: 'Internal Server Error',
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});

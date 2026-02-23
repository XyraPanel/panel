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

export default defineEventHandler(async (event) => {
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

  const now = new Date();

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
});

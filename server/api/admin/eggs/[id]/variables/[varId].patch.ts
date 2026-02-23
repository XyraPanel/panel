import { eq } from 'drizzle-orm';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { updateEggVariableSchema } from '#shared/schema/admin/infrastructure';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE);

  const eggId = getRouterParam(event, 'id');
  const varId = getRouterParam(event, 'varId');

  if (!eggId || !varId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'IDs are required' });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    updateEggVariableSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const db = useDrizzle();

  const [existing] = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.id, varId))
    .limit(1);

  if (!existing || existing.eggId !== eggId) {
    throw createError({ status: 404, statusText: 'Not Found', message: 'Variable not found' });
  }

  const updates: Record<string, string | boolean | Date | null> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.envVariable !== undefined) updates.envVariable = body.envVariable;
  if (body.defaultValue !== undefined) updates.defaultValue = body.defaultValue;
  if (body.userViewable !== undefined) updates.userViewable = body.userViewable;
  if (body.userEditable !== undefined) updates.userEditable = body.userEditable;
  if (body.rules !== undefined) updates.rules = body.rules;

  await db.update(tables.eggVariables).set(updates).where(eq(tables.eggVariables.id, varId));

  const [updated] = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.id, varId))
    .limit(1);

  if (!updated) {
    throw createError({
      status: 404,
      statusText: 'Not Found',
      message: 'Variable not found after update',
    });
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.egg.variable.updated',
    targetType: 'settings',
    targetId: eggId,
    metadata: {
      variableId: varId,
      variableName: updated.name,
      updatedFields: Object.keys(body),
    },
  });

  return {
    data: {
      id: updated.id,
      eggId: updated.eggId,
      name: updated.name,
      description: updated.description,
      envVariable: updated.envVariable,
      defaultValue: updated.defaultValue,
      userViewable: Boolean(updated.userViewable),
      userEditable: Boolean(updated.userEditable),
      rules: updated.rules,
      createdAt: new Date(updated.createdAt).toISOString(),
      updatedAt: new Date(updated.updatedAt).toISOString(),
    },
  };
});

import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { adminSettingsPayloadSchema } from '#shared/schema/admin/settings';

export default defineEventHandler(async (event) => {
  try {
  const session = await requireAdmin(event);

  const body = await readValidatedBodyWithLimit(
    event,
    adminSettingsPayloadSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const db = useDrizzle();

  const updatedKeys: string[] = [];
  const deletedKeys: string[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (value === null) {
      await db.delete(tables.settings).where(eq(tables.settings.key, key));
      deletedKeys.push(key);
      continue;
    }

    const [existing] = await db
      .select()
      .from(tables.settings)
      .where(eq(tables.settings.key, key))
      .limit(1);

    const stringValue = String(value);

    if (existing) {
      await db
        .update(tables.settings)
        .set({ value: stringValue })
        .where(eq(tables.settings.key, key));
    } else {
      await db.insert(tables.settings).values({ key, value: stringValue });
    }
    updatedKeys.push(key);
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.bulk_updated',
    targetType: 'settings',
    metadata: {
      updatedKeys,
      deletedKeys,
    },
  });

  return {
    data: {
      success: true,
      message: 'Settings updated successfully',
      updatedKeys,
      deletedKeys,
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

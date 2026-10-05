import { eq } from 'drizzle-orm';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { updateLocationSchema } from '#shared/schema/admin/infrastructure';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Locations'],
    summary: 'Update a location',
    description:
      'Updates the short code and/or long name of an existing location. Requires an admin session with the locations:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              short: { type: 'string', minLength: 1, maxLength: 60 },
              long: { type: 'string', maxLength: 191 },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Location updated',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    short: { type: 'string' },
                    long: { type: 'string', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing location ID, or invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing locations:write ACL permission' },
      '404': { description: 'Location not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  try {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.LOCATIONS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const locationId = getRouterParam(event, 'id');
  if (!locationId) {
    throw createError({
      status: 400,
      message: 'Location ID is required',
    });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    updateLocationSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const db = useDrizzle();

  const existing = await db
    .select()
    .from(tables.locations)
    .where(eq(tables.locations.id, locationId))
    .limit(1);

  const existingRow = existing[0];

  if (!existingRow) {
    throw createError({ status: 404, message: 'Location not found' });
  }

  const updates: Partial<typeof tables.locations.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.short !== undefined) updates.short = body.short.trim();
  if (body.long !== undefined) updates.long = body.long?.trim() ?? null;

  await db.update(tables.locations).set(updates).where(eq(tables.locations.id, locationId));

  const updatedRows = await db
    .select()
    .from(tables.locations)
    .where(eq(tables.locations.id, locationId))
    .limit(1);

  const updated = updatedRows[0];

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.location.updated',
    targetType: 'settings',
    targetId: locationId,
    metadata: {
      fields: Object.keys(body),
    },
  });

  return {
    data: {
      id: updated!.id,
      short: updated!.short,
      long: updated!.long,
      createdAt: new Date(updated!.createdAt).toISOString(),
      updatedAt: new Date(updated!.updatedAt).toISOString(),
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

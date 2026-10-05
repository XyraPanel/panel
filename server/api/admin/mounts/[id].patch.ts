import { eq, inArray } from 'drizzle-orm';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { updateMountSchema } from '#shared/schema/admin/infrastructure';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { debugError } from '#server/utils/logger';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Mounts'],
    summary: 'Update a mount',
    description:
      'Partially updates a mount, optionally replacing its associated node/egg ID lists. Requires an admin session with the mounts:write ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', maxLength: 255 },
              description: { type: 'string', maxLength: 500 },
              source: { type: 'string' },
              target: { type: 'string' },
              readOnly: { type: 'boolean' },
              userMountable: { type: 'boolean' },
              nodeIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
              eggIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'Mount updated' },
      '400': {
        description: 'Mount ID is required, or one or more specified nodes/eggs were not found',
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing mounts:write ACL permission' },
      '404': { description: 'Mount not found' },
      '500': { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.MOUNTS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const mountId = getRouterParam(event, 'id');
  if (!mountId) {
    throw createError({ status: 400, message: 'Mount ID is required' });
  }

  const body = await readValidatedBodyWithLimit(event, updateMountSchema, BODY_SIZE_LIMITS.SMALL);

  try {
    const db = useDrizzle();

    const [existing] = await db
      .select()
      .from(tables.mounts)
      .where(eq(tables.mounts.id, mountId))
      .limit(1);

    if (!existing) {
      throw createError({ status: 404, message: 'Mount not found' });
    }

    if (body.nodeIds && body.nodeIds.length > 0) {
      const nodes = await db
        .select({ id: tables.wingsNodes.id })
        .from(tables.wingsNodes)
        .where(inArray(tables.wingsNodes.id, body.nodeIds));

      if (nodes.length !== body.nodeIds.length) {
        throw createError({ status: 400, message: 'One or more specified nodes were not found' });
      }
    }

    if (body.eggIds && body.eggIds.length > 0) {
      const eggs = await db
        .select({ id: tables.eggs.id })
        .from(tables.eggs)
        .where(inArray(tables.eggs.id, body.eggIds));

      if (eggs.length !== body.eggIds.length) {
        throw createError({ status: 400, message: 'One or more specified eggs were not found' });
      }
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() ?? null;
    if (body.source !== undefined) updates.source = body.source.trim();
    if (body.target !== undefined) updates.target = body.target.trim();
    if (body.readOnly !== undefined) updates.readOnly = body.readOnly;
    if (body.userMountable !== undefined) updates.userMountable = body.userMountable;

    await db.transaction(async (tx) => {
      if (Object.keys(updates).length > 1) {
        await tx.update(tables.mounts).set(updates).where(eq(tables.mounts.id, mountId));
      }

      if (body.nodeIds !== undefined) {
        await tx.delete(tables.mountNode).where(eq(tables.mountNode.mountId, mountId));
        if (body.nodeIds.length > 0) {
          await tx
            .insert(tables.mountNode)
            .values(body.nodeIds.map((nodeId) => ({ mountId, nodeId })));
        }
      }

      if (body.eggIds !== undefined) {
        await tx.delete(tables.mountEgg).where(eq(tables.mountEgg.mountId, mountId));
        if (body.eggIds.length > 0) {
          await tx.insert(tables.mountEgg).values(body.eggIds.map((eggId) => ({ mountId, eggId })));
        }
      }
    });

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.mount.updated',
      targetType: 'settings',
      targetId: mountId,
      metadata: {
        mountName: updates.name ?? existing.name,
        updatedFields: Object.keys(body),
      },
    });

    return {
      data: {
        success: true,
        id: mountId,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error;
    debugError('[Admin Mount Update] Failed:', error);
    throw createError({
      status: 500,
      message: 'Failed to update mount',
    });
  }
});

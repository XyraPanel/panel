import { createMountSchema } from '#shared/schema/admin/infrastructure';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.MOUNTS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const body = await readValidatedBodyWithLimit(event, createMountSchema, BODY_SIZE_LIMITS.SMALL);

  const db = useDrizzle();

  if (body.nodeIds && body.nodeIds.length > 0) {
    const nodes = await db
      .select({ id: tables.wingsNodes.id })
      .from(tables.wingsNodes)
      .where(inArray(tables.wingsNodes.id, body.nodeIds));

    if (nodes.length !== body.nodeIds.length) {
      throw createError({
        status: 400,
        statusText: 'Bad Request',
        message: 'One or more nodes were not found',
      });
    }
  }

  if (body.eggIds && body.eggIds.length > 0) {
    const eggs = await db
      .select({ id: tables.eggs.id })
      .from(tables.eggs)
      .where(inArray(tables.eggs.id, body.eggIds));

    if (eggs.length !== body.eggIds.length) {
      throw createError({
        status: 400,
        statusText: 'Bad Request',
        message: 'One or more eggs were not found',
      });
    }
  }

  const mountId = randomUUID();
  const now = new Date();

  const newMount = {
    id: mountId,
    uuid: randomUUID(),
    name: body.name.trim(),
    description: body.description?.trim() ?? null,
    source: body.source.trim(),
    target: body.target.trim(),
    readOnly: body.readOnly ?? false,
    userMountable: body.userMountable ?? false,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tables.mounts).values(newMount);

  if (body.nodeIds && body.nodeIds.length > 0) {
    await db.insert(tables.mountNode).values(
      body.nodeIds.map((nodeId) => ({
        mountId,
        nodeId,
      })),
    );
  }

  if (body.eggIds && body.eggIds.length > 0) {
    await db.insert(tables.mountEgg).values(
      body.eggIds.map((eggId) => ({
        mountId,
        eggId,
      })),
    );
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.mount.created',
    targetType: 'settings',
    targetId: mountId,
    metadata: {
      mountName: newMount.name,
      source: newMount.source,
      target: newMount.target,
      nodeCount: body.nodeIds?.length || 0,
      eggCount: body.eggIds?.length || 0,
    },
  });

  return {
    data: {
      id: newMount.id,
      uuid: newMount.uuid,
      name: newMount.name,
      description: newMount.description,
      source: newMount.source,
      target: newMount.target,
      readOnly: newMount.readOnly,
      userMountable: newMount.userMountable,
      eggs: body.eggIds ?? [],
      nodes: body.nodeIds ?? [],
      createdAt: newMount.createdAt,
      updatedAt: newMount.updatedAt,
    },
  };
});

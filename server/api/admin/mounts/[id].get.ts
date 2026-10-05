import { eq } from 'drizzle-orm';
import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import type { AdminMountDetail } from '#shared/types/admin';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Mounts'],
    summary: 'Get a mount',
    description:
      'Returns full details for a single mount, including associated egg and node IDs. Requires an admin session with the mounts:read ACL permission.',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'Mount details' },
      '400': { description: 'Mount ID is required' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing mounts:read ACL permission' },
      '404': { description: 'Mount not found' },
    },
  },
});

export default defineEventHandler(async (event): Promise<{ data: AdminMountDetail }> => {
  await requireAdmin(event);

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.MOUNTS, ADMIN_ACL_PERMISSIONS.READ);

  const mountId = getRouterParam(event, 'id');
  if (!mountId) {
    throw createError({ status: 400, message: 'Mount ID is required' });
  }

  const db = useDrizzle();

  const [mount] = await db.select().from(tables.mounts).where(eq(tables.mounts.id, mountId)).limit(1);

  if (!mount) {
    throw createError({ status: 404, message: 'Mount not found' });
  }

  const [eggRows, nodeRows] = await Promise.all([
    db
      .select({ eggId: tables.mountEgg.eggId })
      .from(tables.mountEgg)
      .where(eq(tables.mountEgg.mountId, mountId)),
    db
      .select({ nodeId: tables.mountNode.nodeId })
      .from(tables.mountNode)
      .where(eq(tables.mountNode.mountId, mountId)),
  ]);

  return {
    data: {
      id: mount.id,
      uuid: mount.uuid,
      name: mount.name,
      description: mount.description,
      source: mount.source,
      target: mount.target,
      readOnly: Boolean(mount.readOnly),
      userMountable: Boolean(mount.userMountable),
      createdAt: new Date(mount.createdAt).toISOString(),
      updatedAt: new Date(mount.updatedAt).toISOString(),
      eggIds: eggRows.map((row) => row.eggId),
      nodeIds: nodeRows.map((row) => row.nodeId),
    },
  };
});

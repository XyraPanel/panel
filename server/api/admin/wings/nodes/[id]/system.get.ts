import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { remoteGetSystemInformation } from '#server/utils/wings/registry';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.READ);
  const { id } = event.context.params ?? {};
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, statusText: 'Missing node id' });
  }

  const query = getQuery(event);
  const versionParam = typeof query.v === 'string' ? Number.parseInt(query.v, 10) : undefined;
  const version = Number.isFinite(versionParam ?? NaN) ? versionParam : 2;

  const systemInfo = await remoteGetSystemInformation(id, version);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.node.system.viewed',
    targetType: 'node',
    targetId: id,
    metadata: {
      version,
    },
  });

  return { data: systemInfo };
});

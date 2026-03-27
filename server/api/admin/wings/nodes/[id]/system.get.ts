import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { remoteGetSystemInformation } from '#server/utils/wings/registry';
import { z } from 'zod';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.READ);
  const { id } = getRouterParams(event);
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, message: 'Missing node id' });
  }

  const { version } = await getValidatedQuery(
    event,
    z
      .object({
        version: z.coerce.number().min(1).default(2),
      })
      .or(
        z
          .object({
            v: z.coerce.number().min(1).default(2),
          })
          .transform((data) => ({ version: data.v })),
      ),
  );

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

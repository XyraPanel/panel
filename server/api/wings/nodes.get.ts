import type { H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { listWingsNodeSummaries } from '#server/utils/wings/nodesStore';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.READ);
  const data = await listWingsNodeSummaries();

  await recordAuditEventFromRequest(event, {
    actor: session?.user?.id ?? 'admin',
    actorType: 'user',
    action: 'admin:wings.nodes.listed',
    targetType: 'node',
    targetId: null,
  });

  return { data };
});

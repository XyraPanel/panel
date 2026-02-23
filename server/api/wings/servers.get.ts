import { type H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { listServers, paginateServers } from '#server/utils/wings/registry';
import { getNodeIdFromQuery, toWingsHttpError } from '#server/utils/wings/http';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  const query = getQuery(event);
  const page = Number(query.page ?? '1');
  const perPage = Number(query.per_page ?? '50');
  const nodeId = getNodeIdFromQuery(query);

  if (Number.isNaN(page) || Number.isNaN(perPage) || perPage <= 0) {
    throw createError({
      status: 400,
      statusText: 'Invalid pagination parameters',
      data: {
        errors: [{ detail: 'Use positive numeric values for page and per_page.' }],
      },
    });
  }

  try {
    if ('page' in query || 'per_page' in query) {
      const result = await paginateServers(page, perPage, nodeId);

      await recordAuditEventFromRequest(event, {
        actor: session?.user?.id ?? 'admin',
        actorType: 'user',
        action: 'admin:wings.servers.paginated',
        targetType: 'server',
        targetId: null,
        metadata: { nodeId: nodeId ?? null, page, perPage },
      });

      return result;
    }

    const servers = await listServers(nodeId);

    await recordAuditEventFromRequest(event, {
      actor: session?.user?.id ?? 'admin',
      actorType: 'user',
      action: 'admin:wings.servers.listed',
      targetType: 'server',
      targetId: null,
      metadata: { nodeId: nodeId ?? null, count: servers.length },
    });

    return {
      data: servers.map((server) => ({
        uuid: server.uuid,
        identifier: server.identifier,
        node: server.node,
        name: server.name,
      })),
    };
  } catch (error) {
    throw toWingsHttpError(error, { operation: 'list Wings servers', nodeId });
  }
});

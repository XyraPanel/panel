import { type H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { z } from 'zod';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { listServers, paginateServers } from '#server/utils/wings/registry';
import { getNodeIdFromQuery, toWingsHttpError } from '#server/utils/wings/http';

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  const query = getQuery(event);
  const nodeId = getNodeIdFromQuery(query);

  const { page, per_page: perPage } = await getValidatedQuery(event, (data) => {
    const result = z
      .object({
        page: z.coerce.number().min(1).default(1),
        per_page: z.coerce.number().min(1).max(500).default(50),
      })
      .safeParse(data);

    if (!result.success) {
      throw createError({
        status: 400,
        message:
          'Invalid pagination parameters: Use positive numeric values for page and per_page.',
        data: {
          errors: [{ detail: 'Use positive numeric values for page and per_page.' }],
        },
      });
    }

    return result.data;
  });

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

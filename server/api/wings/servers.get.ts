import { type H3Event } from 'h3';
import { getValidatedQuery, requireAdmin } from '#server/utils/security';
import { z } from 'zod';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { listServers, paginateServers } from '#server/utils/wings/registry';
import { getNodeIdFromQuery, toWingsHttpError } from '#server/utils/wings/http';

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'List servers across all nodes',
    description:
      'Retrieves a list of all servers registered in the panel, optionally filtered by node ID. Supports offset-based pagination.',
    parameters: [
      {
        in: 'query',
        name: 'node_id',
        schema: { type: 'string' },
        description: 'Filter by a specific node ID',
      },
      {
        in: 'query',
        name: 'page',
        schema: { type: 'integer', default: 1 },
        description: 'Page number (1-indexed)',
      },
      {
        in: 'query',
        name: 'per_page',
        schema: { type: 'integer', default: 50 },
        description: 'Number of servers per page',
      },
    ],
    responses: {
      200: {
        description: 'Servers successfully retrieved',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      uuid: { type: 'string', format: 'uuid' },
                      identifier: { type: 'string' },
                      node: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                },
                meta: { type: 'object' },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      403: { description: 'Admin privileges required' },
      500: { description: 'Internal server error' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  const query = getQuery(event);
  const nodeId = getNodeIdFromQuery(query);

  const { page, per_page: perPage } = await getValidatedQuery(
    event,
    z.object({
      page: z.coerce.number().min(1).default(1),
      per_page: z.coerce.number().min(1).max(500).default(50),
    }),
  );

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

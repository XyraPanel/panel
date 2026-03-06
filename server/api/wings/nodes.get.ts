import type { H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { listWingsNodeSummaries } from '#server/utils/wings/nodesStore';

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'List all Wings nodes',
    description:
      'Retrieves a list of all nodes registered in the panel, including their connection status and basic hardware specifications.',
    responses: {
      200: {
        description: 'Nodes successfully retrieved',
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
                      id: { type: 'string' },
                      name: { type: 'string' },
                      fqdn: { type: 'string' },
                      maintenanceMode: { type: 'boolean' },
                      lastSeenAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
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

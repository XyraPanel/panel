import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'List Wings nodes',
    description:
      'Retrieves a list of all configured Wings nodes in the panel for administrative overview.',
    responses: {
      200: {
        description: 'Successfully retrieved list of nodes',
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
                    },
                  },
                },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      403: { description: 'Administrator privileges required' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const db = useDrizzle();
  const nodes = await db
    .select({
      id: tables.wingsNodes.id,
      name: tables.wingsNodes.name,
    })
    .from(tables.wingsNodes)
    .orderBy(tables.wingsNodes.name);

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.wings.nodes.listed',
    targetType: 'node',
    metadata: { count: nodes.length },
  });

  return { data: nodes };
});

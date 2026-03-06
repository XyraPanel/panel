import { type H3Event } from 'h3';
import { requireAdmin } from '#server/utils/security';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { deleteWingsNode } from '#server/utils/wings/nodesStore';

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'Delete Wings node',
    description: 'Removes a Wings node from the panel. This operation is irreversible and may impact servers assigned to the node.',
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string' },
        description: 'The ID of the node to delete',
      },
    ],
    responses: {
      200: {
        description: 'Node successfully deleted',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      400: { description: 'Missing node ID' },
      401: { description: 'Authentication required' },
      403: { description: 'Admin privileges required' },
      404: { description: 'Node not found' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  const { id } = getRouterParams(event);
  if (!id || typeof id !== 'string') {
    throw createError({ status: 400, message: 'Missing node id' });
  }

  try {
    await deleteWingsNode(id);
    await recordAuditEventFromRequest(event, {
      actor: session?.user?.id ?? 'admin',
      actorType: 'user',
      action: 'admin:wings.node.deleted',
      targetType: 'node',
      targetId: id,
    });

    return { data: { id } };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unable to delete node';
    const status = message.includes('not found') ? 404 : 500;
    throw createError({ status, message });
  }
});

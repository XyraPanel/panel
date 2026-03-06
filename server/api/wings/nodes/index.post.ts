import { type H3Event } from 'h3';
import { createWingsNode, toWingsNodeSummary } from '#server/utils/wings/nodesStore';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';

import { createWingsNodeSchema } from '#shared/schema/wings';

defineRouteMeta({
  openAPI: {
    tags: ['Admin'],
    summary: 'Create Wings node',
    description: 'Registers a new physical server as a Wings node in the panel, allowing it to host game servers.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              fqdn: { type: 'string', format: 'hostname' },
              scheme: { type: 'string', enum: ['http', 'https'] },
              public: { type: 'boolean' },
              maintenanceMode: { type: 'boolean' },
              behindProxy: { type: 'boolean' },
              memory: { type: 'integer' },
              disk: { type: 'integer' },
              daemonListen: { type: 'integer' },
              daemonSftp: { type: 'integer' },
            },
            required: ['name', 'fqdn', 'scheme', 'daemonListen', 'daemonSftp'],
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Node successfully created',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: { type: 'object' },
              },
            },
          },
        },
      },
      400: { description: 'Invalid request body or configuration error' },
      401: { description: 'Authentication required' },
      403: { description: 'Administrator privileges required' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  const session = await requireAdmin(event);
  const body = await readValidatedBodyWithLimit(
    event,
    createWingsNodeSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const node = await createWingsNode(body);

    await recordAuditEventFromRequest(event, {
      actor: session?.user?.id ?? 'admin',
      actorType: 'user',
      action: 'admin:wings.node.created',
      targetType: 'node',
      targetId: node.id,
      metadata: {
        name: node.name,
        fqdn: node.fqdn,
        baseUrl: node.baseURL,
      },
    });

    return { data: toWingsNodeSummary(node) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to create node';
    throw createError({
      statusCode: 400,
      message,
      data: {
        message,
      },
    });
  }
});

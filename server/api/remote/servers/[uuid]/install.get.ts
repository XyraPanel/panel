import { type H3Event } from 'h3';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Remote get server install script',
    description: 'Retrieves the installation script and container metadata for a specific server. Used by Wings nodes during server setup.',
    parameters: [
      {
        in: 'path',
        name: 'uuid',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'The UUID of the server',
      },
    ],
    responses: {
      200: {
        description: 'Install metadata successfully retrieved',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                container_image: { type: 'string' },
                entrypoint: { type: 'string' },
                script: { type: 'string' },
              },
            },
          },
        },
      },
      400: { description: 'Missing server UUID' },
      401: { description: 'Unauthorized Wings node' },
      403: { description: 'Server not assigned to this node' },
      404: { description: 'Server not found' },
      500: { description: 'Egg configuration missing' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  const { uuid } = getRouterParams(event);
  if (!uuid || typeof uuid !== 'string') {
    throw createError({ status: 400, message: 'Missing server UUID' });
  }

  const nodeId = await getNodeIdFromAuth(event);

  const db = useDrizzle();

  const [server] = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1);

  if (!server) {
    throw createError({ status: 404, message: 'Server not found' });
  }

  if (server.nodeId !== nodeId) {
    throw createError({
      status: 403,
      message: 'Forbidden: This server is not assigned to your node',
    });
  }

  if (!server.eggId) {
    throw createError({
      status: 500,
      message: 'Server configuration error: Server is missing egg configuration',
    });
  }

  const [egg] = await db
    .select()
    .from(tables.eggs)
    .where(eq(tables.eggs.id, server.eggId))
    .limit(1);

  if (!egg) {
    throw createError({
      status: 500,
      message: 'Server configuration error: Egg not found',
    });
  }

  return {
    container_image: egg.scriptContainer || 'alpine:3.4',
    entrypoint: egg.scriptEntry || 'ash',
    script: egg.scriptInstall || '',
  };
});

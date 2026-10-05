import { type H3Event } from 'h3';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

defineRouteMeta({
  openAPI: {
    tags: ['Remote (Wings)'],
    summary: 'Get the install script for a server',
    description:
      "Called by the Wings daemon to fetch the egg's install script and container to run it in. Requires a valid node Bearer token; the server must be assigned to the authenticating node.",
    parameters: [
      { name: 'uuid', in: 'path', required: true, schema: { type: 'string' }, description: 'Server UUID' },
    ],
    responses: {
      '200': {
        description: 'Install script details',
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
      '400': { description: 'Missing server UUID, or Authorization header not in a valid format' },
      '401': { description: 'Missing or invalid Wings authentication token' },
      '403': { description: 'Node token not recognized, or server is not assigned to this node' },
      '404': { description: 'Server not found' },
      '500': { description: 'Server configuration error (missing egg configuration or egg not found)' },
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

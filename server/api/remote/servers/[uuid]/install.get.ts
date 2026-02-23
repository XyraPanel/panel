import { type H3Event } from 'h3';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

export default defineEventHandler(async (event: H3Event) => {
  const { uuid } = event.context.params ?? {};
  if (!uuid || typeof uuid !== 'string') {
    throw createError({ status: 400, statusText: 'Missing server UUID' });
  }

  const nodeId = await getNodeIdFromAuth(event);

  const db = useDrizzle();

  const [server] = await db
    .select()
    .from(tables.servers)
    .where(eq(tables.servers.uuid, uuid))
    .limit(1);

  if (!server) {
    throw createError({ status: 404, statusText: 'Server not found' });
  }

  if (server.nodeId !== nodeId) {
    throw createError({
      status: 403,
      statusText: 'Forbidden',
      message: 'This server is not assigned to your node',
    });
  }

  if (!server.eggId) {
    throw createError({
      status: 500,
      statusText: 'Server configuration error',
      message: 'Server is missing egg configuration',
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
      statusText: 'Server configuration error',
      message: 'Egg not found',
    });
  }

  return {
    container_image: egg.scriptContainer || 'alpine:3.4',
    entrypoint: egg.scriptEntry || 'ash',
    script: egg.scriptInstall || '',
  };
});

import { type H3Event } from 'h3';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

export default defineEventHandler(async (event: H3Event) => {
  const { uuid } = event.context.params ?? {};
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

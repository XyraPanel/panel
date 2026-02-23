import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle();
  const { backupId } = event.context.params ?? {};

  if (!backupId || typeof backupId !== 'string') {
    throw createError({ status: 400, statusText: 'Missing backup ID' });
  }

  await getNodeIdFromAuth(event);

  const [backup] = await db
    .select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupId))
    .limit(1);

  if (!backup) {
    throw createError({ status: 404, statusText: 'Backup not found' });
  }

  return {
    parts: [],
    part_size: 5 * 1024 * 1024 * 1024,
  };
});

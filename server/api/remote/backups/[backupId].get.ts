import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';

defineRouteMeta({
  openAPI: {
    tags: ['Remote (Wings)'],
    summary: 'Get multipart upload details for a backup',
    description:
      'Called by the Wings daemon before uploading a backup to remote/S3-compatible storage, to obtain multipart upload part information. Requires a valid node Bearer token.',
    parameters: [
      { name: 'backupId', in: 'path', required: true, schema: { type: 'string' }, description: 'Backup UUID' },
    ],
    responses: {
      '200': {
        description: 'Multipart upload details',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                parts: { type: 'array', items: {} },
                part_size: { type: 'integer', description: 'Max size per part in bytes' },
              },
            },
          },
        },
      },
      '400': { description: 'Missing backup ID, or Authorization header not in a valid format' },
      '401': { description: 'Missing or invalid Wings authentication token' },
      '403': { description: 'Node token not recognized/authorized' },
      '404': { description: 'Backup not found' },
    },
  },
});

export default defineEventHandler(async (event: H3Event) => {
  const db = useDrizzle();
  const { backupId } = getRouterParams(event);

  if (!backupId || typeof backupId !== 'string') {
    throw createError({ status: 400, message: 'Missing backup ID' });
  }

  await getNodeIdFromAuth(event);

  const [backup] = await db
    .select()
    .from(tables.serverBackups)
    .where(eq(tables.serverBackups.uuid, backupId))
    .limit(1);

  if (!backup) {
    throw createError({ status: 404, message: 'Backup not found' });
  }

  return {
    parts: [],
    part_size: 5 * 1024 * 1024 * 1024,
  };
});

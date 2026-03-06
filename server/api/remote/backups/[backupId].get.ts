import { type H3Event } from 'h3';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { getNodeIdFromAuth } from '#server/utils/wings/auth';

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Remote get backup parts',
    description: 'Retrieves multi-part upload metadata for a specific backup for a Wings node. Used for S3 uploads.',
    parameters: [
      {
        in: 'path',
        name: 'backupId',
        required: true,
        schema: { type: 'string' },
        description: 'The UUID of the backup',
      },
    ],
    responses: {
      200: {
        description: 'Multi-part metadata retrieved',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                parts: { type: 'array', items: { type: 'string' } },
                part_size: { type: 'integer' },
              },
            },
          },
        },
      },
      400: { description: 'Missing backup ID' },
      401: { description: 'Unauthorized Wings node' },
      404: { description: 'Backup not found' },
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

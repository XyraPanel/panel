import { getServerWithAccess } from '#server/utils/server-helpers';
import { listServerBackups } from '#server/utils/backups';
import { requireServerPermission } from '#server/utils/permission-middleware';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Server Backups'],
    summary: 'List server backups',
    description: 'Retrieves a list of all backups for the specified server from the database.',
    parameters: [
      {
        in: 'path',
        name: 'server',
        required: true,
        schema: { type: 'string' },
        description: 'Server internal ID, UUID, or identifier',
      },
    ],
    responses: {
      200: {
        description: 'List of backups fetched successfully',
      },
      401: { description: 'Authentication required' },
      403: { description: 'Missing backup.read permission' },
      404: { description: 'Server not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const serverId = getRouterParam(event, 'server');

  if (!serverId) {
    throw createError({
      status: 400,
      message: 'Server identifier is required',
    });
  }

  const { server } = await getServerWithAccess(serverId, accountContext.session);

  await requireServerPermission(event, {
    serverId: server.id,
    requiredPermissions: ['backup.read'],
  });

  const backups = await listServerBackups(server.id);

  return {
    data: backups,
  };
});

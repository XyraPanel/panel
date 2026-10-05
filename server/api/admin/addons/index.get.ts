import { useAddonRegistry } from '#server/addons/loader';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Addons'],
    summary: 'List registered addons',
    description:
      'Returns the list of addons currently registered in the addon registry. Requires an admin session with the dashboard:read ACL permission.',
    responses: {
      '200': {
        description: 'Addon registry contents',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                addons: {
                  type: 'array',
                  items: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing dashboard:read ACL permission' },
    },
  },
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.DASHBOARD, ADMIN_ACL_PERMISSIONS.READ);

  return { addons: useAddonRegistry().list() };
});

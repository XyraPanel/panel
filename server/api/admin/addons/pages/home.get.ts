import { useHooks } from '#server/utils/hooks';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

/** Content blocks addons contribute to the dashboard home page via `pages.home`. */
defineRouteMeta({
  openAPI: {
    tags: ['Admin - Addons'],
    summary: 'List addon dashboard home blocks',
    description:
      'Returns content blocks contributed by addons to the dashboard home page via the `pages.home` hook. Requires an admin session with the dashboard:read ACL permission.',
    responses: {
      '200': {
        description: 'Addon-contributed content blocks',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                blocks: {
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

  const blocks = await useHooks().collect('pages.home');
  return { blocks };
});

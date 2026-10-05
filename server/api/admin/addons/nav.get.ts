import { useHooks } from '#server/utils/hooks';
import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

/**
 * Aggregates addon-contributed navigation items, mirroring the reference
 * app's `navigation` / `navigation.dashboard` / `navigation.account-dropdown`
 * hooks: each addon listens with hooks.filter(name, () => ({...})) and every
 * listener's item is merged here, sorted by priority (lower = earlier).
 */
defineRouteMeta({
  openAPI: {
    tags: ['Admin - Addons'],
    summary: 'List addon navigation items',
    description:
      'Aggregates addon-contributed navigation items for the requested area, sorted by priority. Requires an admin session with the dashboard:read ACL permission.',
    parameters: [
      {
        name: 'area',
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          enum: ['navigation', 'navigation.dashboard', 'navigation.account-dropdown'],
          default: 'navigation',
        },
        description: 'Navigation area to collect items for. Falls back to "navigation" if invalid.',
      },
    ],
    responses: {
      '200': {
        description: 'Navigation items, sorted by priority',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                items: {
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

  const area = (getQuery(event).area as string) || 'navigation';
  const validAreas = ['navigation', 'navigation.dashboard', 'navigation.account-dropdown'];
  const event_ = validAreas.includes(area) ? area : 'navigation';

  const items = await useHooks().collect(event_ as 'navigation');
  items.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  return { items };
});

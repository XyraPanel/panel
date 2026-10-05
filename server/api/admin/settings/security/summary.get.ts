import { requireAdmin } from '#server/utils/security';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Get security settings summary',
    description:
      'Returns a lightweight subset of security settings (2FA enforcement and announcement state) for display in the UI shell. Requires an admin session with the panel_settings:read ACL permission.',
    responses: {
      '200': {
        description: 'Security settings summary',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                enforceTwoFactor: { type: 'boolean' },
                announcementEnabled: { type: 'boolean' },
                announcementMessage: { type: 'string' },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:read ACL permission' },
    },
  },
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.PANEL_SETTINGS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const settings = await getSettings([
    SETTINGS_KEYS.ENFORCE_TWO_FACTOR,
    SETTINGS_KEYS.ANNOUNCEMENT_ENABLED,
    SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE,
  ]);

  return {
    enforceTwoFactor: settings[SETTINGS_KEYS.ENFORCE_TWO_FACTOR] === 'true',
    announcementEnabled: settings[SETTINGS_KEYS.ANNOUNCEMENT_ENABLED] === 'true',
    announcementMessage: settings[SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE] ?? '',
  };
});

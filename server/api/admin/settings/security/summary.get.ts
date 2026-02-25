import { requireAdmin } from '#server/utils/security';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

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

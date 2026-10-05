import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import type { SecuritySettings } from '#shared/types/admin';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Get security settings',
    description:
      'Returns 2FA enforcement, maintenance mode, announcement, session timeout, and queue settings. Requires an admin session with the panel_settings:read ACL permission.',
    responses: {
      '200': {
        description: 'Security settings',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    enforceTwoFactor: { type: 'boolean' },
                    maintenanceMode: { type: 'boolean' },
                    maintenanceMessage: { type: 'string' },
                    announcementEnabled: { type: 'boolean' },
                    announcementMessage: { type: 'string' },
                    sessionTimeoutMinutes: { type: 'integer' },
                    queueConcurrency: { type: 'integer' },
                    queueRetryLimit: { type: 'integer' },
                  },
                },
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
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.PANEL_SETTINGS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const s = await getSettings([
    SETTINGS_KEYS.ENFORCE_TWO_FACTOR,
    SETTINGS_KEYS.MAINTENANCE_MODE,
    SETTINGS_KEYS.MAINTENANCE_MESSAGE,
    SETTINGS_KEYS.ANNOUNCEMENT_ENABLED,
    SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE,
    SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES,
    SETTINGS_KEYS.QUEUE_CONCURRENCY,
    SETTINGS_KEYS.QUEUE_RETRY_LIMIT,
  ]);

  const data: SecuritySettings = {
    enforceTwoFactor: s[SETTINGS_KEYS.ENFORCE_TWO_FACTOR] === 'true',
    maintenanceMode: s[SETTINGS_KEYS.MAINTENANCE_MODE] === 'true',
    maintenanceMessage: s[SETTINGS_KEYS.MAINTENANCE_MESSAGE] ?? '',
    announcementEnabled: s[SETTINGS_KEYS.ANNOUNCEMENT_ENABLED] === 'true',
    announcementMessage: s[SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE] ?? '',
    sessionTimeoutMinutes: parseInt(s[SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES] ?? '60', 10),
    queueConcurrency: parseInt(s[SETTINGS_KEYS.QUEUE_CONCURRENCY] ?? '4', 10),
    queueRetryLimit: parseInt(s[SETTINGS_KEYS.QUEUE_RETRY_LIMIT] ?? '5', 10),
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.security.viewed',
    targetType: 'settings',
  });

  return {
    data,
  };
});

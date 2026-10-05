import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Get mail settings',
    description:
      'Returns the configured SMTP/mail settings. The stored password is never returned; `hasPassword` indicates whether one is set. Requires an admin session with the panel_settings:read ACL permission.',
    responses: {
      '200': {
        description: 'Mail settings',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    driver: { type: 'string' },
                    service: { type: 'string' },
                    host: { type: 'string' },
                    port: { type: 'string' },
                    username: { type: 'string' },
                    password: { type: 'string', description: 'Always empty; use hasPassword instead' },
                    hasPassword: { type: 'boolean' },
                    encryption: { type: 'string' },
                    fromAddress: { type: 'string' },
                    fromName: { type: 'string' },
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
    SETTINGS_KEYS.MAIL_DRIVER,
    SETTINGS_KEYS.MAIL_SERVICE,
    SETTINGS_KEYS.MAIL_HOST,
    SETTINGS_KEYS.MAIL_PORT,
    SETTINGS_KEYS.MAIL_USERNAME,
    SETTINGS_KEYS.MAIL_PASSWORD,
    SETTINGS_KEYS.MAIL_ENCRYPTION,
    SETTINGS_KEYS.MAIL_FROM_ADDRESS,
    SETTINGS_KEYS.MAIL_FROM_NAME,
  ]);

  const appName = useRuntimeConfig().public.appName || 'XyraPanel';
  const data = {
    driver: s[SETTINGS_KEYS.MAIL_DRIVER] ?? 'smtp',
    service: s[SETTINGS_KEYS.MAIL_SERVICE] ?? '',
    host: s[SETTINGS_KEYS.MAIL_HOST] ?? 'localhost',
    port: s[SETTINGS_KEYS.MAIL_PORT] ?? '587',
    username: s[SETTINGS_KEYS.MAIL_USERNAME] ?? '',
    password: '',
    hasPassword: Boolean(s[SETTINGS_KEYS.MAIL_PASSWORD]),
    encryption: s[SETTINGS_KEYS.MAIL_ENCRYPTION] ?? 'tls',
    fromAddress: s[SETTINGS_KEYS.MAIL_FROM_ADDRESS] ?? 'noreply@xyrapanel.local',
    fromName: s[SETTINGS_KEYS.MAIL_FROM_NAME] ?? appName,
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.mail.viewed',
    targetType: 'settings',
  });

  return {
    data,
  };
});

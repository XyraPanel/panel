import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { SETTINGS_KEYS, getSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Get general panel settings',
    description:
      'Returns locale, timezone, branding, pagination, and telemetry settings. Requires an admin session with the panel_settings:read ACL permission.',
    responses: {
      '200': {
        description: 'General settings',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    locale: { type: 'string' },
                    timezone: { type: 'string' },
                    showBrandLogo: { type: 'boolean' },
                    brandLogoUrl: { type: 'string', nullable: true },
                    paginationLimit: { type: 'integer' },
                    telemetryEnabled: { type: 'boolean' },
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
    SETTINGS_KEYS.PANEL_LOCALE,
    SETTINGS_KEYS.PANEL_TIMEZONE,
    SETTINGS_KEYS.BRAND_SHOW_LOGO,
    SETTINGS_KEYS.BRAND_LOGO_PATH,
    SETTINGS_KEYS.PAGINATION_LIMIT,
    SETTINGS_KEYS.TELEMETRY_ENABLED,
  ]);

  const data = {
    locale: s[SETTINGS_KEYS.PANEL_LOCALE] ?? 'en',
    timezone: s[SETTINGS_KEYS.PANEL_TIMEZONE] ?? 'UTC',
    showBrandLogo: s[SETTINGS_KEYS.BRAND_SHOW_LOGO] === 'true',
    brandLogoUrl: s[SETTINGS_KEYS.BRAND_LOGO_PATH] ?? null,
    paginationLimit: parseInt(s[SETTINGS_KEYS.PAGINATION_LIMIT] ?? '25', 10),
    telemetryEnabled: (s[SETTINGS_KEYS.TELEMETRY_ENABLED] ?? 'true') === 'true',
  };

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.general.viewed',
    targetType: 'settings',
  });

  return {
    data,
  };
});

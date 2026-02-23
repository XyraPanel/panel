import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { SETTINGS_KEYS, deleteSetting, setSettings } from '#server/utils/settings';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { generalSettingsSchema } from '#shared/schema/admin/settings';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const body = await readValidatedBodyWithLimit(
    event,
    generalSettingsSchema,
    BODY_SIZE_LIMITS.SMALL,
  );
  const updates: Record<string, string> = {};
  const deletions: string[] = [];

  if (body.locale !== undefined) {
    updates[SETTINGS_KEYS.PANEL_LOCALE] = body.locale;
  }

  if (body.timezone !== undefined) {
    updates[SETTINGS_KEYS.PANEL_TIMEZONE] = body.timezone;
  }

  if (body.showBrandLogo !== undefined) {
    updates[SETTINGS_KEYS.BRAND_SHOW_LOGO] = body.showBrandLogo ? 'true' : 'false';
  }

  if (body.brandLogoUrl !== undefined) {
    if (body.brandLogoUrl === null || body.brandLogoUrl === '') {
      deletions.push(SETTINGS_KEYS.BRAND_LOGO_PATH);
    } else {
      updates[SETTINGS_KEYS.BRAND_LOGO_PATH] = body.brandLogoUrl;
    }
  }

  if (body.paginationLimit !== undefined) {
    updates[SETTINGS_KEYS.PAGINATION_LIMIT] = String(body.paginationLimit);
  }

  if (body.telemetryEnabled !== undefined) {
    updates[SETTINGS_KEYS.TELEMETRY_ENABLED] = body.telemetryEnabled ? 'true' : 'false';
  }

  if (Object.keys(updates).length === 0 && deletions.length === 0) {
    throw createError({
      status: 400,
      message: 'No settings to update',
    });
  }

  await setSettings(updates as Record<(typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS], string>);

  await Promise.all(
    deletions.map((key) =>
      deleteSetting(key as (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS]),
    ),
  );

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.general.updated',
    targetType: 'settings',
    metadata: {
      updatedKeys: Object.keys(updates),
      deletedKeys: deletions,
    },
  });

  return {
    data: {
      success: true,
      updatedKeys: Object.keys(updates),
      deletedKeys: deletions,
    },
  };
});

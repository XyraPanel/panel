import { requireAdmin } from '#server/utils/security'
import { SETTINGS_KEYS, getSettingWithDefault } from '#server/utils/settings'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  const data = {
    driver: getSettingWithDefault(SETTINGS_KEYS.MAIL_DRIVER, 'smtp'),
    service: getSettingWithDefault(SETTINGS_KEYS.MAIL_SERVICE, ''),
    host: getSettingWithDefault(SETTINGS_KEYS.MAIL_HOST, 'localhost'),
    port: getSettingWithDefault(SETTINGS_KEYS.MAIL_PORT, '587'),
    username: getSettingWithDefault(SETTINGS_KEYS.MAIL_USERNAME, ''),
    password: getSettingWithDefault(SETTINGS_KEYS.MAIL_PASSWORD, ''),
    encryption: getSettingWithDefault(SETTINGS_KEYS.MAIL_ENCRYPTION, 'tls'),
    fromAddress: getSettingWithDefault(SETTINGS_KEYS.MAIL_FROM_ADDRESS, 'noreply@xyrapanel.local'),
    fromName: getSettingWithDefault(SETTINGS_KEYS.MAIL_FROM_NAME, useRuntimeConfig().public.appName || 'XyraPanel'),
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.mail.viewed',
    targetType: 'settings',
  })

  return {
    data,
  }
})

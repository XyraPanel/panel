import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { SETTINGS_KEYS, getSettingWithDefault } from '~~/server/utils/settings'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  return {
    driver: getSettingWithDefault(SETTINGS_KEYS.MAIL_DRIVER, 'smtp'),
    host: getSettingWithDefault(SETTINGS_KEYS.MAIL_HOST, 'localhost'),
    port: getSettingWithDefault(SETTINGS_KEYS.MAIL_PORT, '587'),
    username: getSettingWithDefault(SETTINGS_KEYS.MAIL_USERNAME, ''),
    password: getSettingWithDefault(SETTINGS_KEYS.MAIL_PASSWORD, ''),
    encryption: getSettingWithDefault(SETTINGS_KEYS.MAIL_ENCRYPTION, 'tls'),
    fromAddress: getSettingWithDefault(SETTINGS_KEYS.MAIL_FROM_ADDRESS, 'noreply@XyraPanel.local'),
    fromName: getSettingWithDefault(SETTINGS_KEYS.MAIL_FROM_NAME, 'XyraPanel'),
  }
})

import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { SETTINGS_KEYS, getSettingWithDefault, getNumericSetting } from '~~/server/utils/settings'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  return {
    telemetryEnabled: getSettingWithDefault(SETTINGS_KEYS.TELEMETRY_ENABLED, 'true') === 'true',
    debugMode: getSettingWithDefault(SETTINGS_KEYS.DEBUG_MODE, 'false') === 'true',
    recaptchaEnabled: getSettingWithDefault(SETTINGS_KEYS.RECAPTCHA_ENABLED, 'false') === 'true',
    recaptchaSiteKey: getSettingWithDefault(SETTINGS_KEYS.RECAPTCHA_SITE_KEY, ''),
    recaptchaSecretKey: getSettingWithDefault(SETTINGS_KEYS.RECAPTCHA_SECRET_KEY, ''),
    sessionTimeoutMinutes: getNumericSetting(SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES, 60),
    queueConcurrency: getNumericSetting(SETTINGS_KEYS.QUEUE_CONCURRENCY, 4),
    queueRetryLimit: getNumericSetting(SETTINGS_KEYS.QUEUE_RETRY_LIMIT, 5),
  }
})

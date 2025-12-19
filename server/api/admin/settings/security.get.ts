import { getServerSession, isAdmin  } from '~~/server/utils/session'
import { SETTINGS_KEYS, getSetting } from '~~/server/utils/settings'
import type { SecuritySettings } from '#shared/types/admin'

export default defineEventHandler(async (event): Promise<SecuritySettings> => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const enforceTwoFactor = getSetting(SETTINGS_KEYS.ENFORCE_TWO_FACTOR) === 'true'
  const maintenanceMode = getSetting(SETTINGS_KEYS.MAINTENANCE_MODE) === 'true'
  const announcementEnabled = getSetting(SETTINGS_KEYS.ANNOUNCEMENT_ENABLED) === 'true'

  return {
    enforceTwoFactor,
    maintenanceMode,
    maintenanceMessage: getSetting(SETTINGS_KEYS.MAINTENANCE_MESSAGE) ?? '',
    announcementEnabled,
    announcementMessage: getSetting(SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE) ?? '',
    sessionTimeoutMinutes: parseInt(getSetting(SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES) ?? '60', 10),
    queueConcurrency: parseInt(getSetting(SETTINGS_KEYS.QUEUE_CONCURRENCY) ?? '4', 10),
    queueRetryLimit: parseInt(getSetting(SETTINGS_KEYS.QUEUE_RETRY_LIMIT) ?? '5', 10),
  }
})

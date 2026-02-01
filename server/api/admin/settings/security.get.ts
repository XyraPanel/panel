import { requireAdmin } from '#server/utils/security'
import { SETTINGS_KEYS, getSetting } from '#server/utils/settings'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import type { SecuritySettings } from '#shared/types/admin'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  const enforceTwoFactor = getSetting(SETTINGS_KEYS.ENFORCE_TWO_FACTOR) === 'true'
  const maintenanceMode = getSetting(SETTINGS_KEYS.MAINTENANCE_MODE) === 'true'
  const announcementEnabled = getSetting(SETTINGS_KEYS.ANNOUNCEMENT_ENABLED) === 'true'

  const data: SecuritySettings = {
    enforceTwoFactor,
    maintenanceMode,
    maintenanceMessage: getSetting(SETTINGS_KEYS.MAINTENANCE_MESSAGE) ?? '',
    announcementEnabled,
    announcementMessage: getSetting(SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE) ?? '',
    sessionTimeoutMinutes: parseInt(getSetting(SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES) ?? '60', 10),
    queueConcurrency: parseInt(getSetting(SETTINGS_KEYS.QUEUE_CONCURRENCY) ?? '4', 10),
    queueRetryLimit: parseInt(getSetting(SETTINGS_KEYS.QUEUE_RETRY_LIMIT) ?? '5', 10),
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.settings.security.viewed',
    targetType: 'settings',
  })

  return {
    data,
  }
})


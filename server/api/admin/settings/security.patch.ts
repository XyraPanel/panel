import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { SETTINGS_KEYS, setSettings } from '~~/server/utils/settings'
import type { SecuritySettings } from '#shared/types/admin-settings'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const body = await readBody<Partial<SecuritySettings>>(event)

  const updates: Record<string, string> = {}

  if (body.enforceTwoFactor !== undefined) {
    updates[SETTINGS_KEYS.ENFORCE_TWO_FACTOR] = body.enforceTwoFactor ? 'true' : 'false'
  }

  if (body.maintenanceMode !== undefined) {
    updates[SETTINGS_KEYS.MAINTENANCE_MODE] = body.maintenanceMode ? 'true' : 'false'
  }

  if (body.maintenanceMessage !== undefined) {
    updates[SETTINGS_KEYS.MAINTENANCE_MESSAGE] = body.maintenanceMessage
  }

  if (body.announcementEnabled !== undefined) {
    updates[SETTINGS_KEYS.ANNOUNCEMENT_ENABLED] = body.announcementEnabled ? 'true' : 'false'
  }

  if (body.announcementMessage !== undefined) {
    updates[SETTINGS_KEYS.ANNOUNCEMENT_MESSAGE] = body.announcementMessage
  }

  if (Object.keys(updates).length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No settings provided',
    })
  }

  setSettings(updates as Record<typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS], string>)

  return { success: true }
})

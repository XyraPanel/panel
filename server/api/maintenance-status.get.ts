import { SETTINGS_KEYS, getSetting } from '#server/utils/settings'

export default defineEventHandler(() => {
  const maintenanceMode = getSetting(SETTINGS_KEYS.MAINTENANCE_MODE) === 'true'
  const maintenanceMessage = getSetting(SETTINGS_KEYS.MAINTENANCE_MESSAGE) ?? ''

  return {
    maintenanceMode,
    maintenanceMessage,
  }
})

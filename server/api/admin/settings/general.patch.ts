import { getServerSession, isAdmin  } from '~~/server/utils/session'
import { SETTINGS_KEYS, deleteSetting, setSettings } from '~~/server/utils/settings'
import type { GeneralSettings } from '#shared/types/admin'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const body = await readBody<Partial<GeneralSettings>>(event)
  const updates: Record<string, string> = {}
  const deletions: string[] = []

  if (body.locale !== undefined) {
    updates[SETTINGS_KEYS.PANEL_LOCALE] = body.locale
  }

  if (body.timezone !== undefined) {
    updates[SETTINGS_KEYS.PANEL_TIMEZONE] = body.timezone
  }

  if (body.showBrandLogo !== undefined) {
    updates[SETTINGS_KEYS.BRAND_SHOW_LOGO] = body.showBrandLogo ? 'true' : 'false'
  }

  if (body.brandLogoUrl !== undefined) {
    if (body.brandLogoUrl === null || body.brandLogoUrl === '') {
      deletions.push(SETTINGS_KEYS.BRAND_LOGO_PATH)
    }
    else {
      updates[SETTINGS_KEYS.BRAND_LOGO_PATH] = body.brandLogoUrl
    }
  }

  if (body.paginationLimit !== undefined) {
    const value = body.paginationLimit
    if (!Number.isInteger(value) || value < 10 || value > 100) {
      throw createError({
        statusCode: 422,
        message: 'Pagination limit must be an integer between 10 and 100',
      })
    }
    updates[SETTINGS_KEYS.PAGINATION_LIMIT] = String(value)
  }

  if (body.telemetryEnabled !== undefined) {
    updates[SETTINGS_KEYS.TELEMETRY_ENABLED] = body.telemetryEnabled ? 'true' : 'false'
  }

  if (Object.keys(updates).length === 0 && deletions.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No settings to update',
    })
  }

  setSettings(updates as Record<typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS], string>)

  for (const key of deletions) {
    deleteSetting(key as typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS])
  }

  return { success: true }
})

import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { SETTINGS_KEYS, setSettings } from '~~/server/utils/settings'
import type { AdvancedSettings } from '#shared/types/admin-settings'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const body = await readBody<Partial<AdvancedSettings>>(event)
  const updates: Record<string, string> = {}

  if (body.telemetryEnabled !== undefined) {
    updates[SETTINGS_KEYS.TELEMETRY_ENABLED] = body.telemetryEnabled ? 'true' : 'false'
  }

  if (body.debugMode !== undefined) {
    updates[SETTINGS_KEYS.DEBUG_MODE] = body.debugMode ? 'true' : 'false'
  }

  if (body.recaptchaEnabled !== undefined) {
    updates[SETTINGS_KEYS.RECAPTCHA_ENABLED] = body.recaptchaEnabled ? 'true' : 'false'
  }

  if (body.recaptchaSiteKey !== undefined) {
    updates[SETTINGS_KEYS.RECAPTCHA_SITE_KEY] = body.recaptchaSiteKey
  }

  if (body.recaptchaSecretKey !== undefined) {
    updates[SETTINGS_KEYS.RECAPTCHA_SECRET_KEY] = body.recaptchaSecretKey
  }

  const numericFields: Array<{ key: keyof AdvancedSettings; target: typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS]; min: number; max?: number }> = [
    { key: 'sessionTimeoutMinutes', target: SETTINGS_KEYS.SESSION_TIMEOUT_MINUTES, min: 5, max: 1440 },
    { key: 'queueConcurrency', target: SETTINGS_KEYS.QUEUE_CONCURRENCY, min: 1, max: 32 },
    { key: 'queueRetryLimit', target: SETTINGS_KEYS.QUEUE_RETRY_LIMIT, min: 1, max: 50 },
  ]

  for (const field of numericFields) {
    const raw = body[field.key]
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (value === undefined)
      continue

    if (!Number.isInteger(value) || value < field.min || (field.max !== undefined && value > field.max)) {
      throw createError({
        statusCode: 422,
        message: `${field.key} must be an integer between ${field.min} and ${field.max ?? '∞'}`,
      })
    }

    updates[field.target] = String(value)
  }

  if (Object.keys(updates).length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No settings to update',
    })
  }

  setSettings(updates as Record<typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS], string>)

  return { success: true }
})

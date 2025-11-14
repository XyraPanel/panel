import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { SETTINGS_KEYS, setSettings } from '~~/server/utils/settings'
import type { MailSettings } from '#shared/types/admin-settings'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const body = await readBody<Partial<MailSettings>>(event)
  const updates: Record<string, string> = {}

  if (body.driver !== undefined) {
    updates[SETTINGS_KEYS.MAIL_DRIVER] = body.driver
  }

  if (body.host !== undefined) {
    updates[SETTINGS_KEYS.MAIL_HOST] = body.host
  }

  if (body.port !== undefined) {
    updates[SETTINGS_KEYS.MAIL_PORT] = body.port
  }

  if (body.username !== undefined) {
    updates[SETTINGS_KEYS.MAIL_USERNAME] = body.username
  }

  if (body.password !== undefined) {
    updates[SETTINGS_KEYS.MAIL_PASSWORD] = body.password
  }

  if (body.encryption !== undefined) {
    updates[SETTINGS_KEYS.MAIL_ENCRYPTION] = body.encryption
  }

  if (body.fromAddress !== undefined) {
    updates[SETTINGS_KEYS.MAIL_FROM_ADDRESS] = body.fromAddress
  }

  if (body.fromName !== undefined) {
    updates[SETTINGS_KEYS.MAIL_FROM_NAME] = body.fromName
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

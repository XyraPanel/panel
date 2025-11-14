import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, message: 'Admin access required' })
  }

  const db = useDrizzle()
  const settings = await db.select().from(tables.settings).all()

  const settingsObject: Record<string, string> = {}
  for (const setting of settings) {
    settingsObject[setting.key] = setting.value
  }

  return {
    data: settingsObject,
  }
})

import { getServerSession } from '#auth'
import { getSessionUser } from '~~/server/utils/session'
import { useDrizzle, tables, eq, and } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { id } = event.context.params ?? {}
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing SSH key ID' })
  }

  const db = useDrizzle()

  const key = db
    .select()
    .from(tables.sshKeys)
    .where(and(
      eq(tables.sshKeys.id, id),
      eq(tables.sshKeys.userId, user.id),
    ))
    .get()

  if (!key) {
    throw createError({ statusCode: 404, statusMessage: 'SSH key not found' })
  }

  db.delete(tables.sshKeys)
    .where(eq(tables.sshKeys.id, id))
    .run()

  return {
    success: true,
    message: 'SSH key deleted successfully',
  }
})

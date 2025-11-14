import { getServerSession } from '#auth'
import { getSessionUser } from '~~/server/utils/session'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const db = useDrizzle()
  const keys = db
    .select()
    .from(tables.sshKeys)
    .where(eq(tables.sshKeys.userId, user.id))
    .all()

  return {
    data: keys.map(key => ({
      id: key.id,
      name: key.name,
      fingerprint: key.fingerprint,
      public_key: key.publicKey,
      created_at: key.createdAt,
    })),
  }
})

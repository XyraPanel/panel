import { createError, readBody } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<{ username?: string, email?: string }>(event)
  if (!body || (!body.username && !body.email)) {
    throw createError({ statusCode: 400, statusMessage: 'Provide username or email to update' })
  }

  const db = useDrizzle()

  try {
    await db.update(tables.users)
      .set({
        username: body.username ?? undefined,
        email: body.email ?? undefined,
      })
      .where(eq(tables.users.id, user.id))
      .run()

    return {
      data: {
        ...user,
        username: body.username ?? user.username,
        email: body.email ?? user.email,
      },
    }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to update profile'
    throw createError({ statusCode: 400, statusMessage: message })
  }
})

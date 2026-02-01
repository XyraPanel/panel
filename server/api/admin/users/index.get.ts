import { or, like, desc } from 'drizzle-orm'
import { requireAdmin } from '#server/utils/security'
import { useDrizzle, tables } from '#server/utils/drizzle'
import type { UserOption } from '#shared/types/ui'

export default defineEventHandler(async (event): Promise<{ data: UserOption[] }> => {
  await requireAdmin(event)

  const query = getQuery(event)
  const searchValue = query.search as string | undefined
  const limit = query.limit ? Number.parseInt(String(query.limit), 10) : 100
  const offset = query.offset ? Number.parseInt(String(query.offset), 10) : 0

  const db = useDrizzle()

  try {
    let usersQuery = db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        email: tables.users.email,
      })
      .from(tables.users)

    if (searchValue) {
      usersQuery = usersQuery.where(
        or(
          like(tables.users.email, `%${searchValue}%`),
          like(tables.users.username, `%${searchValue}%`)
        )
      ) as typeof usersQuery
    }

    const users = usersQuery
      .orderBy(desc(tables.users.createdAt))
      .limit(limit)
      .offset(offset)
      .all()

    const userOptions: UserOption[] = users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email || undefined,
    }))

    return {
      data: userOptions,
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list users'
    throw createError({
      statusCode: 500,
      statusMessage: message,
    })
  }
})

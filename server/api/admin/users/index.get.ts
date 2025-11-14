import { getServerSession } from '#auth'
import { useDrizzle, tables, or } from '~~/server/utils/drizzle'
import { like, count } from 'drizzle-orm'
import { getSessionUser } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  const user = getSessionUser(session)

  if (user?.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: 'Unauthorized: Admin access required',
    })
  }

  const query = getQuery(event)
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 25
  const search = query.search as string | undefined
  const offset = (page - 1) * limit

  const db = useDrizzle()

  const whereConditions = search
    ? or(
      like(tables.users.email, `%${search}%`),
      like(tables.users.username, `%${search}%`),
      like(tables.users.nameFirst, `%${search}%`),
      like(tables.users.nameLast, `%${search}%`),
    )
    : undefined

  const [{ total }] = db
    .select({ total: count() })
    .from(tables.users)
    .where(whereConditions)
    .all()

  const users = db
    .select({
      id: tables.users.id,
      username: tables.users.username,
      email: tables.users.email,
      nameFirst: tables.users.nameFirst,
      nameLast: tables.users.nameLast,
      language: tables.users.language,
      rootAdmin: tables.users.rootAdmin,
      emailVerified: tables.users.emailVerified,
      image: tables.users.image,
      createdAt: tables.users.createdAt,
      updatedAt: tables.users.updatedAt,

    })
    .from(tables.users)
    .where(whereConditions)
    .limit(limit)
    .offset(offset)
    .orderBy(tables.users.createdAt)
    .all()

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
})

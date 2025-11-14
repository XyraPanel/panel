

import type { H3Event } from 'h3'
import type { Permission } from './permissions'

export async function requireAdmin(event: H3Event): Promise<void> {
  const { getServerSession } = await import('#auth')
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const { useDrizzle, tables, eq } = await import('./drizzle')
  const db = useDrizzle()

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, session.user.email!))
    .get()

  if (!user || !user.rootAdmin) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }
}

export async function requireServerPermission(
  event: H3Event,
  serverId: string,
  permission: Permission
): Promise<{ userId: string }> {
  const { getServerSession } = await import('#auth')
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const { useDrizzle, tables, eq } = await import('./drizzle')
  const db = useDrizzle()

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, session.user.email!))
    .get()

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'User not found',
    })
  }

  if (user.rootAdmin) {
    return { userId: user.id }
  }

  const { hasPermission } = await import('./permissions')
  const hasAccess = await hasPermission(user.id, serverId, permission)

  if (!hasAccess) {
    throw createError({
      statusCode: 403,
      message: `Missing permission: ${permission}`,
    })
  }

  return { userId: user.id }
}

export async function getAuthenticatedUserId(event: H3Event): Promise<string> {
  const { getServerSession } = await import('#auth')
  const session = await getServerSession(event)

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  const { useDrizzle, tables, eq } = await import('./drizzle')
  const db = useDrizzle()

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, session.user.email!))
    .get()

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'User not found',
    })
  }

  return user.id
}

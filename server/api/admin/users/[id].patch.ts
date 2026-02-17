import { APIError } from 'better-auth/api'
import { useDrizzle, tables, eq, assertSqliteDatabase } from '#server/utils/drizzle'
import type { UpdateUserRequest } from '#shared/types/user'
import { recordAuditEventFromRequest } from '#server/utils/audit'
import { requireAdmin } from '#server/utils/security'
import { auth, normalizeHeadersForAuth } from '#server/utils/auth'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'

type PatchUserBody = Partial<UpdateUserRequest> & {
  role?: 'admin' | 'user'
}

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.USERS, ADMIN_ACL_PERMISSIONS.WRITE)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ status: 400, statusText: 'Bad Request', message: 'User ID is required' })
  }

  const body = await readBody<PatchUserBody>(event)

  try {
    const updateData: Record<string, unknown> = {}
    
    if (body.nameFirst !== undefined || body.nameLast !== undefined) {
      const name = [body.nameFirst, body.nameLast].filter(Boolean).join(' ') || undefined
      if (name) updateData.name = name
    }

    const db = useDrizzle()
    assertSqliteDatabase(db)
    const headers = normalizeHeadersForAuth(event.node.req.headers)
    
    if (body.email !== undefined) {
      const currentUser = db
        .select({ email: tables.users.email })
        .from(tables.users)
        .where(eq(tables.users.id, userId))
        .get()
      
      if (currentUser && currentUser.email !== body.email) {
        db.update(tables.users)
          .set({
            email: body.email,
            emailVerified: null,
            updatedAt: new Date(),
          })
          .where(eq(tables.users.id, userId))
          .run()
      }
    }

    if (body.role !== undefined) {
      await auth.api.setRole({
        body: { userId, role: body.role },
        headers,
      })

      db.update(tables.users)
        .set({
          role: body.role,
          updatedAt: new Date(),
        })
        .where(eq(tables.users.id, userId))
        .run()
    }

    if (body.password) {
      await auth.api.setUserPassword({
        body: {
          userId,
          newPassword: body.password,
        },
        headers,
      })

      db.update(tables.users)
        .set({
          passwordResetRequired: false,
          updatedAt: new Date(),
        })
        .where(eq(tables.users.id, userId))
        .run()
    }

    if (body.username !== undefined || body.rootAdmin !== undefined) {
      const updates: Partial<typeof tables.users.$inferInsert> = {
        updatedAt: new Date(),
      }
      
      if (body.username !== undefined) updates.username = body.username
      if (body.rootAdmin !== undefined) updates.rootAdmin = body.rootAdmin
      
      db.update(tables.users)
        .set(updates)
        .where(eq(tables.users.id, userId))
        .run()
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.user.updated',
      targetType: 'user',
      targetId: userId,
      metadata: {
        fields: Object.keys(body),
      },
    })

    const updatedUser = db
      .select({
        id: tables.users.id,
        username: tables.users.username,
        email: tables.users.email,
        nameFirst: tables.users.nameFirst,
        nameLast: tables.users.nameLast,
        role: tables.users.role,
        createdAt: tables.users.createdAt,
      })
      .from(tables.users)
      .where(eq(tables.users.id, userId))
      .get()

    if (!updatedUser) {
      throw createError({ status: 404, statusText: 'Not Found', message: 'User not found after update' })
    }

    return {
      data: {
        id: updatedUser.id,
        username: updatedUser.username || updatedUser.email,
        email: updatedUser.email,
        name: [updatedUser.nameFirst, updatedUser.nameLast].filter(Boolean).join(' ') || null,
        role: updatedUser.role || 'user',
        createdAt: updatedUser.createdAt?.toISOString() || new Date().toISOString(),
      },
    }
  }
  catch (error) {
    if (error instanceof APIError) {
      const statusCode = typeof error.status === 'number' ? error.status : Number(error.status ?? 500) || 500
      throw createError({
        statusCode,
        statusMessage: error.message || 'Failed to update user',
      })
    }
    throw createError({
      status: 500,
      statusText: 'Failed to update user',
    })
  }
})

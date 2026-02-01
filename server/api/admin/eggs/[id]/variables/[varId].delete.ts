import { eq } from 'drizzle-orm'
import { requireAdmin } from '#server/utils/security'
import { useDrizzle, tables } from '#server/utils/drizzle'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.EGGS, ADMIN_ACL_PERMISSIONS.WRITE)

  const eggId = getRouterParam(event, 'id')
  const varId = getRouterParam(event, 'varId')

  if (!eggId || !varId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'IDs are required' })
  }

  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.id, varId))
    .get()

  if (!existing || existing.eggId !== eggId) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Variable not found' })
  }

  await db.delete(tables.eggVariables).where(eq(tables.eggVariables.id, varId)).run()

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.egg.variable.deleted',
    targetType: 'settings',
    targetId: eggId,
    metadata: {
      variableId: varId,
      variableName: existing.name,
      envVariable: existing.envVariable,
    },
  })

  return {
    data: {
      success: true,
      deletedId: varId,
    },
  }
})

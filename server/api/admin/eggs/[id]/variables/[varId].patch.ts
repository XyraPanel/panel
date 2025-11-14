import { eq } from 'drizzle-orm'
import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { UpdateEggVariablePayload } from '#shared/types/admin-nests'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const eggId = getRouterParam(event, 'id')
  const varId = getRouterParam(event, 'varId')

  if (!eggId || !varId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'IDs are required' })
  }

  const body = await readBody<UpdateEggVariablePayload>(event)
  const db = useDrizzle()

  const existing = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.id, varId))
    .get()

  if (!existing || existing.eggId !== eggId) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Variable not found' })
  }

  const updates: Record<string, string | boolean | Date | null> = {
    updatedAt: new Date(),
  }

  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.envVariable !== undefined) updates.envVariable = body.envVariable
  if (body.defaultValue !== undefined) updates.defaultValue = body.defaultValue
  if (body.userViewable !== undefined) updates.userViewable = body.userViewable
  if (body.userEditable !== undefined) updates.userEditable = body.userEditable
  if (body.rules !== undefined) updates.rules = body.rules

  await db.update(tables.eggVariables).set(updates).where(eq(tables.eggVariables.id, varId))

  const updated = await db
    .select()
    .from(tables.eggVariables)
    .where(eq(tables.eggVariables.id, varId))
    .get()

  return {
    data: {
      id: updated!.id,
      eggId: updated!.eggId,
      name: updated!.name,
      description: updated!.description,
      envVariable: updated!.envVariable,
      defaultValue: updated!.defaultValue,
      userViewable: Boolean(updated!.userViewable),
      userEditable: Boolean(updated!.userEditable),
      rules: updated!.rules,
      createdAt: new Date(updated!.createdAt).toISOString(),
      updatedAt: new Date(updated!.updatedAt).toISOString(),
    },
  }
})

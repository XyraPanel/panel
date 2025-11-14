import { getServerSession } from '#auth'
import { isAdmin } from '~~/server/utils/session'
import { useDrizzle, tables } from '~~/server/utils/drizzle'
import type { CreateEggVariablePayload } from '#shared/types/admin-nests'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!isAdmin(session)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const eggId = getRouterParam(event, 'id')
  if (!eggId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Egg ID is required' })
  }

  const body = await readBody<CreateEggVariablePayload>(event)

  if (!body.name || !body.envVariable) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Name and environment variable are required',
    })
  }

  const db = useDrizzle()

  const egg = await db.select().from(tables.eggs).where(eq(tables.eggs.id, eggId)).get()
  if (!egg) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Egg not found' })
  }

  const now = new Date()

  const newVariable = {
    id: randomUUID(),
    eggId,
    name: body.name,
    description: body.description || null,
    envVariable: body.envVariable,
    defaultValue: body.defaultValue || null,
    userViewable: body.userViewable ?? true,
    userEditable: body.userEditable ?? true,
    rules: body.rules || null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tables.eggVariables).values(newVariable)

  return {
    data: {
      id: newVariable.id,
      eggId: newVariable.eggId,
      name: newVariable.name,
      description: newVariable.description,
      envVariable: newVariable.envVariable,
      defaultValue: newVariable.defaultValue,
      userViewable: newVariable.userViewable,
      userEditable: newVariable.userEditable,
      rules: newVariable.rules,
      createdAt: newVariable.createdAt.toISOString(),
      updatedAt: newVariable.updatedAt.toISOString(),
    },
  }
})

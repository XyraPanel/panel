import { createError } from 'h3'
import { getServerSession } from '#auth'
import { useDrizzle, tables, eq } from '~~/server/utils/drizzle'
import { isAdmin } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!isAdmin(session)) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required',
    })
  }

  const allocationId = getRouterParam(event, 'id')
  if (!allocationId) {
    throw createError({
      statusCode: 400,
      message: 'Allocation ID is required',
    })
  }

  const body = await readBody(event)
  const { ipAlias } = body

  const db = useDrizzle()
  const [allocation] = db.select()
    .from(tables.serverAllocations)
    .where(eq(tables.serverAllocations.id, allocationId))
    .limit(1)
    .all()

  if (!allocation) {
    throw createError({
      statusCode: 404,
      message: 'Allocation not found',
    })
  }

  db.update(tables.serverAllocations)
    .set({
      ipAlias: ipAlias || null,
      updatedAt: new Date(),
    })
    .where(eq(tables.serverAllocations.id, allocationId))
    .run()

  return {
    success: true,
    message: 'Allocation updated successfully',
  }
})

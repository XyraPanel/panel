import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { getServerSession } from '~~/server/utils/session'
import { resolveSessionUser } from '~~/server/utils/auth/sessionUser'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import { useDrizzle } from '~~/server/utils/drizzle'
import * as tables from '~~/server/database/schema'
import type { CreateServerSchedulePayload, ServerScheduleResponse } from '#shared/types/server'

export default defineEventHandler(async (event): Promise<ServerScheduleResponse> => {
  const identifier = event.context.params?.id
  if (!identifier || typeof identifier !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing server identifier' })
  }

  const session = await getServerSession(event)
  const user = resolveSessionUser(session)

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const server = await findServerByIdentifier(identifier)
  if (!server) {
    throw createError({ statusCode: 404, statusMessage: 'Server not found' })
  }

  const isAdmin = user.role === 'admin'
  const isOwner = server.ownerId === user.id

  if (!isAdmin && !isOwner) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const body = await readBody<CreateServerSchedulePayload>(event)

  if (!body.name || !body.cron || !body.action) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      message: 'Name, cron expression, and action are required',
    })
  }

  const db = useDrizzle()
  const scheduleId = randomUUID()

  try {
    await db.insert(tables.serverSchedules).values({
      id: scheduleId,
      serverId: server.id,
      name: body.name,
      cron: body.cron,
      action: body.action,
      nextRunAt: null,
      lastRunAt: null,
      enabled: body.enabled ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return {
      success: true,
      data: {
        id: scheduleId,
        name: body.name,
        cron: body.cron,
        action: body.action,
        enabled: body.enabled ?? true,
      },
    }
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Database Error',
      message: error instanceof Error ? error.message : 'Failed to create schedule',
    })
  }
})

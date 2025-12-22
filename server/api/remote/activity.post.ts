import { createError, readBody, type H3Event } from 'h3'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'
import { findServerByIdentifier } from '~~/server/utils/serversStore'
import type { WingsActivityBatchRequest } from '#shared/types/wings'
import type { ActivityAction } from '#shared/types/audit'

export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody<WingsActivityBatchRequest>(event)

  if (!body.data || !Array.isArray(body.data)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'Invalid activity data format',
    })
  }

  const activities = body.data

  const insertedCount = activities.length
  let successCount = 0

  const serverCache = new Map<string, Awaited<ReturnType<typeof findServerByIdentifier>> | null>()

  for (const activity of activities) {
    try {

      if (!activity.event || !activity.timestamp) {
        console.warn('Skipping invalid activity log:', activity)
        continue
      }

      let resolvedServer = null
      const serverKey = activity.server

      if (serverKey) {
        if (!serverCache.has(serverKey)) {
          const serverRecord = await findServerByIdentifier(serverKey)
          serverCache.set(serverKey, serverRecord)
        }
        resolvedServer = serverCache.get(serverKey) ?? null
      }

      await recordAuditEventFromRequest(event, {
        actor: activity.user || 'system',
        actorType: 'daemon',
        action: activity.event as ActivityAction,
        targetType: 'server',
        targetId: resolvedServer?.id ?? activity.server ?? null,
        metadata: {
          ...activity.metadata,
          serverUuid: resolvedServer?.uuid ?? activity.server ?? undefined,
          serverIdentifier: resolvedServer?.identifier ?? undefined,
          ip: activity.ip,
          wings_timestamp: activity.timestamp,
          source: 'wings',
        },
      })

      successCount++
    }
    catch (error) {
      console.error('Failed to insert activity log:', error, activity)

    }
  }

  return {
    success: true,
    received: insertedCount,
    processed: successCount,
    failed: insertedCount - successCount,
  }
})

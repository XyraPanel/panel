import { createError, readBody, type H3Event } from 'h3'
import { recordAuditEventFromRequest } from '~~/server/utils/audit'
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

  for (const activity of activities) {
    try {

      if (!activity.event || !activity.timestamp) {
        console.warn('Skipping invalid activity log:', activity)
        continue
      }

      await recordAuditEventFromRequest(event, {
        actor: activity.user || 'system',
        actorType: 'daemon',
        action: activity.event as ActivityAction,
        targetType: 'server',
        targetId: activity.server || null,
        metadata: {
          ...activity.metadata,
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

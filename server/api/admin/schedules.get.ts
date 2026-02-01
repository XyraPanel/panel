import { requireAdmin } from '#server/utils/security'
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions'
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl'
import type { AdminScheduleResponse, NitroTasksResponse } from '#shared/types/admin'
import { recordAuditEventFromRequest } from '#server/utils/audit'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)

  await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.SCHEDULES, ADMIN_ACL_PERMISSIONS.READ)

  const wingsSchedules: AdminScheduleResponse[] = []

  let nitroTasksResponse: NitroTasksResponse = { tasks: {}, scheduledTasks: [] }
  
  try {
    const host = event.node.req.headers.host || 'localhost'
    const protocol = event.node.req.headers['x-forwarded-proto'] || 'http'
    const url = `${protocol}://${host}/api/admin/schedules/nitro-tasks`
    
    const response = await fetch(url, {
      headers: {
        cookie: event.node.req.headers.cookie || '',
      },
    })
    
    if (response.ok) {
      const payload = await response.json() as { data?: NitroTasksResponse } | NitroTasksResponse
      nitroTasksResponse = 'data' in payload && payload.data
        ? payload.data
        : (payload as NitroTasksResponse)
    }
  } catch (error) {
    console.error('Failed to fetch Nitro tasks:', error)
  }

  const allSchedules: AdminScheduleResponse[] = [...wingsSchedules]

  for (const scheduledTask of nitroTasksResponse.scheduledTasks ?? []) {
    for (const taskName of scheduledTask.tasks) {
      const taskInfo = nitroTasksResponse.tasks[taskName]
      
      const displayName = taskInfo?.description 
        ? taskInfo.description.charAt(0).toUpperCase() + taskInfo.description.slice(1)
        : taskName
          .split(':')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' '))
          .join(' ')
      
      allSchedules.push({
        id: `nitro:${taskName}:${scheduledTask.cron}`,
        name: displayName,
        description: taskName, 
        serverName: 'Panel (Nitro)',
        cron: scheduledTask.cron,
        nextRun: null, // Nitro handles scheduling internally
        lastRun: null, // Nitro tasks don't log execution times
        enabled: true, // Scheduled tasks are always enabled
        type: 'nitro',
      })
    }
  }

  await recordAuditEventFromRequest(event, {
    actor: session.user.email || session.user.id,
    actorType: 'user',
    action: 'admin.schedules.viewed',
    targetType: 'settings',
    targetId: null,
    metadata: {
      scheduleCount: allSchedules.length,
      nitroTasks: nitroTasksResponse.scheduledTasks?.length ?? 0,
    },
  })

  return {
    data: allSchedules,
  }
})

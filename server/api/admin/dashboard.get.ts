import { defineEventHandler } from 'h3'
import { desc } from 'drizzle-orm'

import { useDrizzle, tables } from '~~/server/utils/drizzle'
import { listWingsNodes } from '~~/server/utils/wings/nodesStore'
import { remotePaginateServers } from '~~/server/utils/wings/registry'

import type {
  DashboardResponse,
  DashboardMetric,
  DashboardNode,
  DashboardIncident,
  DashboardOperation,
  NodeStatus,
} from '#shared/types/admin'

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try { return JSON.parse(raw) as Record<string, unknown> } 
  catch { return { raw } }
}

function formatHelperRange(current: number, total: number, suffix: string): string {
  if (total === 0) return `0 ${suffix}`
  return `${current}/${total} ${suffix}`
}

export default defineEventHandler(async (): Promise<DashboardResponse> => {
  const db = useDrizzle()
  const nodes = listWingsNodes()

  const nodeResults = await Promise.all(nodes.map(async (node): Promise<DashboardNode> => {
    let serverCount: number | null = null
    let issue: string | null = null
    let status: NodeStatus = node.maintenanceMode ? 'maintenance' : 'unknown'

    try {
      const response = await remotePaginateServers(1, 1, node.id)
      serverCount = response.meta.total
      if (!node.maintenanceMode) status = 'online'
    } catch (error) {
      issue = error instanceof Error ? error.message : 'Failed to contact Wings node'
    }

    if (node.maintenanceMode) status = 'maintenance'

    return {
      id: node.id,
      name: node.name,
      fqdn: node.fqdn,
      allowInsecure: node.allowInsecure,
      maintenanceMode: node.maintenanceMode,
      lastSeenAt: node.lastSeenAt,
      serverCount,
      status,
      issue,
    }
  }))

  const respondingNodes = nodeResults.filter(n => n.status === 'online').length
  const maintenanceNodes = nodeResults.filter(n => n.status === 'maintenance').length
  const unreachableNodes = nodeResults.filter(n => n.status === 'unknown').length
  const totalServers = nodeResults.reduce((sum, n) => sum + (n.serverCount ?? 0), 0)

  const users = db.select({ id: tables.users.id, displayUsername: tables.users.displayUsername }).from(tables.users).all()
  const usersMap = Object.fromEntries(users.map(u => [u.id, u.displayUsername]))

  const userRows = db.select({ role: tables.users.role }).from(tables.users).all()
  const totalUsers = userRows.length
  const adminUsers = userRows.filter(u => u.role === 'admin').length

  const scheduleRows = db.select({
    enabled: tables.serverSchedules.enabled,
    nextRunAt: tables.serverSchedules.nextRunAt,
  }).from(tables.serverSchedules).all()

  const activeSchedules = scheduleRows.filter(s => s.enabled).length
  const soonThreshold = new Date(Date.now() + 30 * 60 * 1000)
  const dueSoonCount = scheduleRows.filter(s => s.enabled && s.nextRunAt && s.nextRunAt <= soonThreshold).length

  const audits = db.select({
    id: tables.auditEvents.id,
    occurredAt: tables.auditEvents.occurredAt,
    actor: tables.auditEvents.actor,
    action: tables.auditEvents.action,
    targetType: tables.auditEvents.targetType,
    targetId: tables.auditEvents.targetId,
    metadata: tables.auditEvents.metadata,
  })
    .from(tables.auditEvents)
    .orderBy(desc(tables.auditEvents.occurredAt))
    .limit(5)
    .all()

  const incidents: DashboardIncident[] = audits.map(event => ({
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    actor: event.actor,
    actorUsername: usersMap[event.actor] ?? undefined,
    action: event.action,
    target: event.targetId ? `${event.targetType}#${event.targetId}` : event.targetType,
    metadata: parseMetadata(event.metadata),
  }))

  const metrics: DashboardMetric[] = [
    {
      key: 'nodes-online',
      label: 'Responding nodes',
      value: respondingNodes,
      icon: 'i-lucide-server',
      helper: formatHelperRange(respondingNodes, nodes.length, 'responding'),
    },
    {
      key: 'servers-registered',
      label: 'Servers registered',
      value: totalServers,
      icon: 'i-lucide-monitor',
      helper: unreachableNodes > 0
        ? `${unreachableNodes} node${unreachableNodes === 1 ? '' : 's'} unreachable`
        : maintenanceNodes > 0
          ? `${maintenanceNodes} in maintenance`
          : null,
    },
    {
      key: 'panel-users',
      label: 'Panel users',
      value: totalUsers,
      icon: 'i-lucide-users',
      helper: totalUsers > 0 ? `${adminUsers} admin${adminUsers === 1 ? '' : 's'}` : 'No users recorded',
    },
    {
      key: 'active-schedules',
      label: 'Active schedules',
      value: activeSchedules,
      icon: 'i-lucide-calendar-clock',
      helper: dueSoonCount > 0 ? `${dueSoonCount} due within 30 min` : null,
    },
  ]

  const operations: DashboardOperation[] = []

  if (nodes.length === 0) operations.push({ key: 'connect-node', label: 'Connect a Wings node', detail: 'No Wings nodes are configured. Add a node to start provisioning servers.' })
  if (unreachableNodes > 0) operations.push({ key: 'resolve-nodes', label: 'Resolve unreachable nodes', detail: `${unreachableNodes} node${unreachableNodes === 1 ? '' : 's'} failed to respond to the remote API.` })
  if (totalServers === 0 && nodes.length > 0) operations.push({ key: 'provision-servers', label: 'Provision servers', detail: 'No servers are registered across your Wings nodes. Create a server from the Servers page.' })
  if (adminUsers <= 1) operations.push({ key: 'invite-admin', label: 'Invite additional admin', detail: 'Only one administrator account exists. Invite a teammate to ensure redundant access.' })
  if (dueSoonCount > 0) operations.push({ key: 'review-schedules', label: 'Review upcoming schedules', detail: `${dueSoonCount} schedule${dueSoonCount === 1 ? '' : 's'} scheduled within 30 minutes.` })
  if (operations.length === 0) operations.push({ key: 'all-clear', label: 'All systems nominal', detail: 'Wings nodes and panel services are responding as expected.' })

  return {
    metrics,
    nodes: nodeResults,
    incidents,
    operations,
    generatedAt: new Date().toISOString(),
  }
})

import { defineEventHandler } from 'h3'

import { tables, useDrizzle } from '~~/server/utils/drizzle'
import { listWingsNodes } from '~~/server/utils/wings/nodesStore'
import { remoteListServers } from '~~/server/utils/wings/registry'
import { listAuditEvents } from '~~/server/utils/serversStore'

import type {
  ClientDashboardMetric,
  ClientDashboardActivity,
  ClientDashboardQuickLink,
  ClientDashboardMaintenanceItem,
  ClientDashboardNodeSummary,
  ClientDashboardResponse,
} from '#shared/types/dashboard'

function selectActivityIcon(action: string): string {
  const normalized = action.toLowerCase()
  if (normalized.includes('backup')) {
    return 'i-lucide-archive-restore'
  }
  if (normalized.includes('install') || normalized.includes('deploy')) {
    return 'i-lucide-rocket'
  }
  if (normalized.includes('restart') || normalized.includes('power')) {
    return 'i-lucide-power'
  }
  if (normalized.includes('node')) {
    return 'i-lucide-hard-drive'
  }
  if (normalized.includes('schedule')) {
    return 'i-lucide-calendar-clock'
  }
  if (normalized.includes('user') || normalized.includes('team')) {
    return 'i-lucide-users'
  }
  return 'i-lucide-activity'
}

function deriveNodeStatus(node: ClientDashboardNodeSummary): ClientDashboardNodeSummary['status'] {
  if (node.maintenanceMode) {
    return 'maintenance'
  }
  if (node.serverCount !== null && node.serverCount > 0) {
    return 'operational'
  }
  return 'unknown'
}

function parseMetadata(raw: string | null): string {
  if (!raw) {
    return ''
  }

  try {
    const value = JSON.parse(raw) as unknown
    if (typeof value === 'string') {
      return value
    }
    if (value && typeof value === 'object') {
      const summary = Object.entries(value as Record<string, unknown>)
        .map(([key, val]) => `${key}: ${String(val)}`)
        .join(', ')
      return summary || raw
    }
    return String(value)
  }
  catch {
    return raw
  }
}

export default defineEventHandler(async (): Promise<ClientDashboardResponse> => {
  const db = useDrizzle()

  const nodes = listWingsNodes()
  const enrichedNodes: ClientDashboardNodeSummary[] = await Promise.all(nodes.map(async (node) => {
    let serverCount: number | null = null

    try {
      const servers = await remoteListServers(node.id)
      serverCount = servers.length
    }
    catch {
      serverCount = null
    }

    const summary: ClientDashboardNodeSummary = {
      id: node.id,
      name: node.name,
      fqdn: node.fqdn,
      maintenanceMode: node.maintenanceMode,
      lastSeenAt: node.lastSeenAt,
      serverCount,
      status: 'unknown',
    }

    return {
      ...summary,
      status: deriveNodeStatus(summary),
    }
  }))

  const serverRows = db.select({ id: tables.servers.id }).from(tables.servers).all()
  const totalServers = serverRows.length

  const scheduleCount = db.select({ id: tables.serverSchedules.id }).from(tables.serverSchedules).all().length

  const incidents = await listAuditEvents({ limit: 5 })

  const metrics: ClientDashboardMetric[] = [
    {
      key: 'servers-active',
      label: 'Active servers',
      value: totalServers,
      icon: 'i-lucide-server',
      delta: totalServers > 0 ? `${totalServers} registered` : 'No servers deployed',
    },
    {
      key: 'schedules-active',
      label: 'Automation schedules',
      value: scheduleCount,
      icon: 'i-lucide-calendar-clock',
      delta: scheduleCount > 0 ? `${scheduleCount} tracking` : 'None configured',
    },
  ]

  const activity: ClientDashboardActivity[] = incidents.map((entry) => ({
    id: entry.id,
    title: entry.action,
    description: parseMetadata(entry.metadata),
    occurredAt: entry.occurredAt instanceof Date ? entry.occurredAt.toISOString() : new Date(entry.occurredAt).toISOString(),
    actor: entry.actor,
    icon: selectActivityIcon(entry.action),
    serverUuid: entry.targetType === 'server' ? entry.targetId ?? undefined : undefined,
    nodeId: entry.targetType === 'node' ? entry.targetId ?? undefined : undefined,
    target: entry.targetId ?? null,
  }))

  const quickLinks: ClientDashboardQuickLink[] = [
    { label: 'Servers overview', icon: 'i-lucide-monitor', to: '/server' },
    { label: 'View nodes', icon: 'i-lucide-hard-drive', to: '/infrastructure/nodes' },
  ]

  const maintenance: ClientDashboardMaintenanceItem[] = [
    {
      id: 'schedule-downtime',
      title: 'Schedule downtime window',
      description: 'Set upcoming maintenance windows so players are notified.',
      icon: 'i-lucide-calendar-clock',
      to: '/maintenance',
    },
    {
      id: 'review-crash-reports',
      title: 'Review crash reports',
      description: 'Analyze recent server crashes to spot recurring issues.',
      icon: 'i-lucide-clipboard-list',
      to: '/activity/crash-reports',
    },
    {
      id: 'invite-team-member',
      title: 'Invite team member',
      description: 'Grant access to engineers or moderators who help manage nodes.',
      icon: 'i-lucide-user-plus',
      to: '/admin/users/invite',
    },
  ]

  return {
    metrics,
    activity,
    quickLinks,
    maintenance,
    nodes: enrichedNodes,
    generatedAt: new Date().toISOString(),
  }
})

export type NodeStatus = 'online' | 'maintenance' | 'unknown'

export interface DashboardMetric {
  key: string
  label: string
  value: number
  icon: string
  helper: string | null
}

export interface DashboardNode {
  id: string
  name: string
  fqdn: string
  allowInsecure: boolean
  maintenanceMode: boolean
  lastSeenAt: string | null
  serverCount: number | null
  status: NodeStatus
  issue: string | null
}

export interface DashboardIncident {
  id: string
  occurredAt: string
  actor: string
  action: string
  target: string | null
  metadata: Record<string, unknown> | null
}

export interface DashboardOperation {
  key: string
  label: string
  detail: string
}

export interface DashboardResponse {
  metrics: DashboardMetric[]
  nodes: DashboardNode[]
  incidents: DashboardIncident[]
  operations: DashboardOperation[]
  generatedAt: string
}

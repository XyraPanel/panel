export interface ClientDashboardMetric {
  key: string
  label: string
  value: number | string
  delta?: string | null
  icon: string
}

export interface ClientDashboardActivity {
  id: string
  title: string
  description: string
  occurredAt: string
  actor: string
  icon: string
  serverUuid?: string | null
  nodeId?: string | null
  target?: string | null
}

export interface ClientDashboardQuickLink {
  label: string
  icon: string
  to: string
}

export interface ClientDashboardMaintenanceItem {
  id: string
  title: string
  description: string
  icon: string
  to: string
}

export interface ClientDashboardNodeSummary {
  id: string
  name: string
  fqdn: string
  status: 'operational' | 'maintenance' | 'unknown'
  serverCount: number | null
  lastSeenAt: string | null
  maintenanceMode: boolean
}

export interface ClientDashboardEndpointSection {
  title: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  description: string
  to: string
}

export interface ClientDashboardOperationCard {
  title: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  description: string
}

export interface ClientDashboardResponse {
  metrics: ClientDashboardMetric[]
  activity: ClientDashboardActivity[]
  quickLinks: ClientDashboardQuickLink[]
  maintenance: ClientDashboardMaintenanceItem[]
  nodes: ClientDashboardNodeSummary[]
  generatedAt: string
}

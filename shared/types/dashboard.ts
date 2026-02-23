export interface ClientDashboardMetric {
  key: string;
  label: string;
  value: number | string;
  delta?: string | null;
  icon: string;
}

export interface ClientDashboardActivity {
  id: string;
  title: string;
  description?: string;
  occurredAt?: string;
  actor?: string;
  icon: string;
  serverUuid?: string | null;
  nodeId?: string | null;
  target?: string | null;
  action?: string | null;
  metadata?: Record<string, unknown>;
  host?: string | null;
  protocol?: string | null;
  url?: string | null;
  method?: string | null;
  userAgent?: string | null;
  name?: string | null;
  fqdn?: string | null;
  baseUrl?: string | null;
}

export interface ClientDashboardQuickLink {
  label: string;
  icon: string;
  to: string;
}

export interface ClientDashboardMaintenanceItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  to: string;
}

export interface ClientDashboardNodeSummary {
  id: string;
  name: string;
  fqdn: string;
  status: 'operational' | 'maintenance' | 'unknown';
  serverCount: number | null;
  lastSeenAt: string | null;
  maintenanceMode: boolean;
}

export interface ClientDashboardEndpointSection {
  title: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  to: string;
}

export interface ClientDashboardOperationCard {
  title: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
}

export interface ClientDashboardResponse {
  metrics: ClientDashboardMetric[];
  activity: ClientDashboardActivity[];
  quickLinks: ClientDashboardQuickLink[];
  maintenance: ClientDashboardMaintenanceItem[];
  nodes: ClientDashboardNodeSummary[];
  generatedAt: string;
}

export interface DashboardUserIdentity {
  username?: string | null;
  email?: string | null;
  name?: string | null;
}

export interface MeResponse {
  user: DashboardUserIdentity | null;
}

export interface DashboardData {
  user: DashboardUserIdentity | null;
  dashboard: ClientDashboardResponse;
}

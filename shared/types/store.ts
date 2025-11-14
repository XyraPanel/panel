import type { AdminActivityEntry } from './admin'
import type { DashboardResponse } from './admin-dashboard'
import type { ServerListEntry } from './servers'

export interface ServersStoreState {
  servers: ServerListEntry[]
  generatedAt: string | null
  loading: boolean
  error: string | null
}

export type AdminDashboardStoreState = DashboardResponse & {
  loading: boolean
  ready: boolean
  error: string | null
}

export interface AccountActivityStoreState {
  items: AdminActivityEntry[]
  generatedAt: string | null
  loading: boolean
  error: string | null
}

import type { StoredWingsNode, WingsSystemInformation } from './wings'

export interface AdminWingsNodeAllocationSummary {
  id: string
  ip: string
  port: number
  isPrimary: boolean
  serverId: string | null
  serverName: string
  serverIdentifier: string
}

export interface AdminWingsNodeServerSummary {
  id: string
  uuid: string
  identifier: string
  name: string
  createdAt: string
  updatedAt: string
  primaryAllocation?: {
    ip: string
    port: number
  } | null
}

export interface AdminWingsNodeStats {
  serversTotal: number
  allocationsTotal: number
  maintenanceMode: boolean
  memoryProvisioned: number
  diskProvisioned: number
  lastSeenAt: string | null
}

export interface AdminWingsNodeDetail {
  node: StoredWingsNode
  stats: AdminWingsNodeStats
  recentServers: AdminWingsNodeServerSummary[]
  allocations: AdminWingsNodeAllocationSummary[]
  system?: WingsSystemInformation | null
  systemError?: string | null
}

export interface AdminPaginatedMeta {
  page: number
  perPage: number
  total: number
  hasMore: boolean
}

export interface AdminWingsNodeServersPayload {
  data: AdminWingsNodeServerSummary[]
  pagination: AdminPaginatedMeta
}

export interface AdminWingsNodeAllocationsPayload {
  data: AdminWingsNodeAllocationSummary[]
  pagination: AdminPaginatedMeta
}

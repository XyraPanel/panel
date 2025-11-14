
export interface Allocation {
  id: string
  nodeId: string
  serverId: string | null
  ip: string
  port: number
  isPrimary: boolean
  ipAlias: string | null
  notes: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

export interface WingsAllocation {
  force_outgoing_ip: boolean
  default: {
    ip: string
    port: number
  }
  mappings: Record<string, number[]>
}

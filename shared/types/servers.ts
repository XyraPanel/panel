export interface ServerListEntry {
  uuid: string
  identifier: string
  name: string
  nodeId: string
  nodeName: string
  description: string | null
  limits: Record<string, unknown> | null
  featureLimits: Record<string, unknown> | null
  status: string
  ownership: 'mine' | 'shared'
  suspended?: boolean
  isTransferring?: boolean
}

export interface ServersResponse {
  data: ServerListEntry[]
  generatedAt: string
}

export interface ServerStartupVariable {
  id: string
  serverId: string
  key: string
  value: string
  description: string | null
  isEditable: boolean
  createdAt: string
  updatedAt: string
}

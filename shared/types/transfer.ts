
export interface ServerTransfer {
  id: string
  serverId: string
  oldNode: string
  newNode: string
  oldAllocation: string
  newAllocation: string
  oldAdditionalAllocations: string | null
  newAdditionalAllocations: string | null
  successful: boolean
  archived: boolean
  createdAt: Date | string
  updatedAt: Date | string
}

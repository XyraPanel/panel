export interface ServerBackup {
  id: string
  serverId: string
  uuid: string
  name: string
  ignoredFiles: string[]
  disk: 'wings' | 's3'
  checksum: string | null
  bytes: number
  isSuccessful: boolean
  isLocked: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

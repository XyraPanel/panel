
export interface Server {
  id: string
  uuid: string
  identifier: string
  externalId: string | null
  name: string
  description: string | null
  status: string | null
  suspended: boolean
  skipScripts: boolean
  ownerId: string | null
  nodeId: string | null
  allocationId: string | null
  nestId: string | null
  eggId: string | null
  startup: string | null
  image: string | null
  allocationLimit: number | null
  databaseLimit: number | null
  backupLimit: number
  installedAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ServerWithLimits extends Server {
  limits: ServerLimits | null
}

export interface ServerLimits {
  cpu: number | null
  memory: number | null
  disk: number | null
  swap: number | null
  io: number | null
  threads: string | null
  oomDisabled: boolean
}

export interface ServerResponse {
  data: Server
}

export interface ServerLimitsResponse {
  data: ServerLimits
}

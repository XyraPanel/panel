export interface ServerDatabase {
  id: string
  serverId: string
  databaseHostId: string
  name: string
  username: string
  remote: string
  maxConnections: number | null
  status: string
  createdAt: string
  updatedAt: string
  host: {
    hostname: string
    port: number
  }
}

export interface CreateServerDatabasePayload {
  name: string
  remote: string
}

export interface ServerDatabaseCredentials {
  id: string
  name: string
  username: string
  password: string
  host: {
    hostname: string
    port: number
  }
}

export interface ServerDatabaseCreateResponse {
  success: boolean
  data: ServerDatabaseCredentials
}

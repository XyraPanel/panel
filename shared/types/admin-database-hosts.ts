export interface DatabaseHost {
  id: string
  name: string
  hostname: string
  port: number
  username: string | null
  password: string | null
  database: string | null
  nodeId: string | null
  maxDatabases: number | null
  createdAt: string
  updatedAt: string
}

export interface DatabaseHostWithStats extends DatabaseHost {
  databaseCount: number
  nodeName?: string
}

export interface CreateDatabaseHostPayload {
  name: string
  hostname: string
  port?: number
  username: string
  password: string
  database?: string
  nodeId?: string
  maxDatabases?: number
}

export interface UpdateDatabaseHostPayload {
  name?: string
  hostname?: string
  port?: number
  username?: string
  password?: string
  database?: string
  nodeId?: string
  maxDatabases?: number
}

export interface TestDatabaseConnectionPayload {
  hostname: string
  port: number
  username: string
  password: string
  database?: string
}

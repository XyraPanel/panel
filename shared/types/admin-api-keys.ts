export interface ApiKey {
  id: string
  identifier: string
  memo: string | null
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export interface ApiKeyWithToken extends ApiKey {
  apiKey: string
}

export interface ApiKeyPermissions {
  rServers?: number
  rNodes?: number
  rAllocations?: number
  rUsers?: number
  rLocations?: number
  rNests?: number
  rEggs?: number
  rDatabaseHosts?: number
  rServerDatabases?: number
}

export interface CreateApiKeyPayload {
  memo?: string
  allowedIps?: string[]
  expiresAt?: string
  permissions?: ApiKeyPermissions
}

export interface ApiKeysResponse {
  data: ApiKey[]
}

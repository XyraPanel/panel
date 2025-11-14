import type { AuditEventResponse } from './admin-audit'
import type { AdminUserResponse } from './api-responses'

export interface AdminScheduleResponse {
  id: string
  name: string
  serverName: string
  cron: string
  nextRun: string | null
  lastRun: string | null
  enabled: boolean
}

export interface AdminSchedulesPayload {
  data: AdminScheduleResponse[]
}

export interface AdminUsersPayload {
  data: AdminUserResponse[]
}

export interface AdminUserProfileUser {
  id: string
  username: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  language: string
  role: string
  rootAdmin: boolean
  twoFactorEnabled: boolean
  emailVerified: boolean
  emailVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminUserServerSummary {
  id: string
  uuid: string
  identifier: string
  name: string
  status: string | null
  suspended: boolean
  nodeName: string | null
  createdAt: string
}

export interface AdminUserApiKeySummary {
  id: string
  identifier: string
  memo: string | null
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

export interface AdminUserProfilePayload {
  user: AdminUserProfileUser
  stats: {
    serverCount: number
    apiKeyCount: number
  }
  servers: AdminUserServerSummary[]
  apiKeys: AdminUserApiKeySummary[]
  activity: AdminActivityEntry[]
}

export interface AdminRemoteServerRow {
  uuid: string
  identifier: string
  node: string
  name: string
  status: string | null
  players: string | null
}

export type AdminActivityEntry = AuditEventResponse

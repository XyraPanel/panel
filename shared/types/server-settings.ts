import type { ServerLimits } from './server'

export interface ServerInfo {
  id: string
  uuid: string
  identifier: string
  name: string
  description: string | null
  suspended: boolean
}

export interface SettingsData {
  server: ServerInfo
  limits: ServerLimits | null
}

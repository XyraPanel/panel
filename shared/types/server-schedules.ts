export interface ServerSchedule {
  id: string
  serverId: string
  name: string
  cron: string
  action: string
  nextRunAt: string | null
  lastRunAt: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateServerSchedulePayload {
  name: string
  cron: string
  action: string
  enabled?: boolean
}

export interface ServerScheduleResponse {
  success: boolean
  data: {
    id: string
    name: string
    cron: string
    action: string
    enabled: boolean
  }
}

export interface UpdateServerSchedulePayload {
  name?: string
  cron?: string
  action?: string
  enabled?: boolean
}

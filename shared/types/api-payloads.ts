

export interface UpdateEmailPayload {
  email: string
  password: string
}

export interface RenameServerPayload {
  name: string
}

export interface CommandRequest {
  command: string
}

export interface PowerActionRequest {
  action: 'start' | 'stop' | 'restart' | 'kill'
}

export interface UpdateVariablePayload {
  value: string
}

export interface CreateDatabasePayload {
  name: string
  remote: string
}

export interface CreateSubuserPayload {
  email: string
  permissions: string[]
}

export interface UpdateSubuserPayload {
  permissions: string[]
}

export interface CreateAllocationPayload {
  allocationId: string
}

export interface UpdateAllocationPayload {
  notes?: string
}

export interface CreateBackupPayload {
  name?: string
  locked?: boolean
}

export interface CreateSchedulePayload {
  name: string
  cron: {
    minute: string
    hour: string
    day_of_month: string
    month: string
    day_of_week: string
  }
  is_active: boolean
  only_when_online: boolean
}

export interface UpdateSchedulePayload {
  name?: string
  cron?: {
    minute: string
    hour: string
    day_of_month: string
    month: string
    day_of_week: string
  }
  is_active?: boolean
  only_when_online?: boolean
}

export interface CreateTaskPayload {
  action: string
  payload: string
  time_offset?: number
}

export interface UpdateNodePayload {
  name?: string
  description?: string
  fqdn?: string
  scheme?: 'http' | 'https'
  behindProxy?: boolean
  public?: boolean
  maintenanceMode?: boolean
  memory?: number
  memoryOverallocate?: number
  disk?: number
  diskOverallocate?: number
  uploadSize?: number
}

export interface EggImportData {
  name: string
  author?: string
  description?: string
  features?: string[]
  docker_images?: Record<string, string>
  file_denylist?: string[]
  startup?: string
  config?: {
    files?: Record<string, unknown>
    startup?: Record<string, unknown>
    stop?: string
    logs?: Record<string, unknown>
  }
  scripts?: {
    installation?: {
      script?: string
      container?: string
      entrypoint?: string
    }
  }
  variables?: Array<{
    name: string
    description?: string
    env_variable: string
    default_value: string
    user_viewable?: boolean
    user_editable?: boolean
    rules?: string
  }>
}

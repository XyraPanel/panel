import type { BaseActivityEvent } from './audit'

export interface AuditEventResponse extends BaseActivityEvent {
  target: string
  details: Record<string, unknown>
}

export interface AuditEventsPagination {
  page: number
  perPage: number
  total: number
  hasMore: boolean
}

export interface AuditEventsPayload {
  data: AuditEventResponse[]
  pagination: AuditEventsPagination
}

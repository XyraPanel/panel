import type { BaseActivityEvent } from './audit'

export interface AccountActivityItem extends BaseActivityEvent {
  target: string | null
}

export interface AccountActivityResponse {
  data: AccountActivityItem[]
  generatedAt: string
}

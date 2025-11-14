import type { BaseActivityEvent } from './audit'

export interface ServerActivityEvent extends BaseActivityEvent {
  actorType: string
  targetType: string
  targetId: string | null
}

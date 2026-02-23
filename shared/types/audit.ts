export type ActorType = 'user' | 'system' | 'daemon';

export type TargetType =
  | 'user'
  | 'server'
  | 'backup'
  | 'node'
  | 'database'
  | 'file'
  | 'settings'
  | 'session'
  | 'api_key';

export type ActivityAction =
  | 'account.api_key.create'
  | 'account.api_key.delete'
  | 'account.api_key.used'
  | 'account.api_key.invalid'
  | 'admin.api_key.create'
  | 'admin.api_key.delete'
  | 'account.password.update'
  | string;

export interface ActivityMetadata {
  ip?: string;
  userAgent?: string;
  host?: string;
  protocol?: string;
  url?: string;
  method?: string;
  fingerprint?: string | null;
  [key: string]: unknown;
}

export interface LogActivityOptions {
  actor: string;
  actorType: ActorType;
  action: ActivityAction;
  targetType: TargetType;
  targetId?: string | null;
  metadata?: ActivityMetadata;
}

export interface BaseActivityEvent {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  metadata: Record<string, unknown> | null;
}

export interface AuditEvent extends BaseActivityEvent {
  actorType: ActorType;
  targetType: TargetType;
  targetId: string | null;
  createdAt: Date;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditLogResponse {
  events: AuditEvent[];
  pagination: Pagination;
}

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  search?: string;
  actor?: string;
  action?: string;
  targetType?: string;
}

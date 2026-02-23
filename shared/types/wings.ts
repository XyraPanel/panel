import type { SftpAuthRequest, SftpAuthResponse } from './api';

export type StopType = 'command' | 'signal' | 'stop';

export interface WingsRemotePaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  from: number;
  to: number;
  total: number;
}

export interface WingsErrorOptions {
  operation?: string;
  nodeId?: string;
}

export interface WingsFetchError extends Error {
  response?: Response;
  data?: unknown;
}

export type WingsQuery = Record<string, unknown>;

export interface WingsHttpOptions {
  baseURL: string;
  token: string;
  allowInsecure: boolean;
}

export interface WingsHttpRequestOptions extends WingsHttpOptions {
  method?: string;
  query?: WingsQuery;
  body?: unknown;
}

export interface WingsActivityLog {
  user: string;
  server: string;
  event: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

export interface WingsActivityBatchRequest {
  data: WingsActivityLog[];
}

export type WingsSftpAuthRequest = SftpAuthRequest;
export type WingsSftpAuthResponse = SftpAuthResponse;

export interface WingsServerLimits {
  memory: number;
  swap: number;
  disk: number;
  io: number;
  cpu: number;
}

export interface WingsServerFeatureLimits {
  databases: number;
  allocations: number;
  backups: number;
}

export interface WingsRemoteServer {
  uuid: string;
  identifier: string;
  name: string;
  node: string;
  description?: string;
  limits?: WingsServerLimits;
  feature_limits?: WingsServerFeatureLimits;
}

export interface WingsServerConfigurationResponse {
  settings: Record<string, unknown>;
  process_configuration: Record<string, unknown>;
}

export interface WingsPaginatedResponse<T> {
  data: T[];
  meta: WingsRemotePaginationMeta;
}

export interface StoredWingsNode {
  id: string;
  uuid: string;
  name: string;
  description?: string;
  baseURL: string;
  fqdn: string;
  scheme: string;
  public: boolean;
  maintenanceMode: boolean;
  behindProxy: boolean;
  apiToken: string;
  allowInsecure: boolean;
  memory: number;
  memoryOverallocate: number;
  disk: number;
  diskOverallocate: number;
  uploadSize: number;
  daemonBase: string;
  daemonListen: number;
  daemonSftp: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WingsNodeSummary extends Omit<StoredWingsNode, 'apiToken'> {
  hasToken: boolean;
}

export interface WingsNodeConfiguration {
  debug: boolean;
  uuid: string;
  token_id: string;
  token: string;
  api: {
    host: string;
    port: number;
    ssl: {
      enabled: boolean;
      cert: string;
      key: string;
    };
    upload_limit: number;
  };
  system: {
    data: string;
    sftp: {
      bind_port: number;
    };
  };
  allowed_mounts: string[];
  remote: string;
}

export type WingsSystemInformation = Partial<WingsSystemStats> & Record<string, unknown>;

export interface WingsSystemStats {
  version: string;
  architecture: string;
  kernel: string;
  os: string;
  timezone: string;
  uptime: number;
  cpu: {
    cores: number;
    threads: number;
    model: string;
    load: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    cached: number;
    buffers: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
  };
}

export interface CreateWingsNodeInput {
  id?: string;
  name: string;
  description?: string;
  baseURL: string;
  apiToken?: string;
  allowInsecure?: boolean;
  public?: boolean;
  maintenanceMode?: boolean;
  behindProxy?: boolean;
  memory?: number;
  memoryOverallocate?: number;
  disk?: number;
  diskOverallocate?: number;
  uploadSize?: number;
  daemonBase?: string;
  daemonListen?: number;
  daemonSftp?: number;
}

export interface WingsJWTClaims {
  server_uuid?: string;
  user_uuid?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export interface WingsJWTOptions {
  user?: {
    id: string;
    uuid?: string;
  };
  server?: {
    uuid: string;
  };
  permissions?: string[];
  expiresIn?: string | number;
  subject?: string;
  identifiedBy?: string;
}

export interface WingsNodeAuthData {
  node: string;
  token: string;
}

export interface WingsNodeConnection {
  fqdn: string;
  scheme: string;
  daemonListen: number;
  tokenId: string;
  tokenSecret: string;
  allowInsecure?: boolean;
}

export interface UpdateWingsNodeInput {
  name?: string;
  description?: string;
  baseURL?: string;
  apiToken?: string;
  allowInsecure?: boolean;
  public?: boolean;
  maintenanceMode?: boolean;
  behindProxy?: boolean;
  memory?: number;
  memoryOverallocate?: number;
  disk?: number;
  diskOverallocate?: number;
  uploadSize?: number;
  daemonBase?: string;
  daemonListen?: number;
  daemonSftp?: number;
}

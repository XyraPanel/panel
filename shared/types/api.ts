export interface DataResponse<T> {
  data: T;
}

export interface DataResponseWithMeta<T, M> {
  data: T;
  meta: M;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface ApiKeyResponse {
  data: {
    identifier: string;
    description: string | null;
    allowed_ips: string[];
    last_used_at: string | null;
    created_at: string;
  };
  meta: {
    secret_token: string;
  };
}

export interface AdminUserResponse {
  id: string;
  username: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  rootAdmin: boolean;
  suspended: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  passwordResetRequired: boolean;
  serversOwned?: number;
  serversAccess?: number;
}

export interface UsersResponse {
  data: AdminUserResponse[];
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface StartupResponse {
  data: {
    startup: string;
    dockerImage: string;
    dockerImages?: Record<string, string>;
    environment: Record<string, string>;
  };
}

export interface WebSocketToken {
  token: string;
  socket: string;
}

export interface FileEntry {
  name: string;
  mode: string;
  mode_bits: string;
  size: number;
  is_file: boolean;
  is_symlink: boolean;
  mimetype: string;
  created_at: string;
  modified_at: string;
}

export interface SftpAuthRequest {
  type: 'password' | 'public_key';
  username: string;
  password?: string;
  public_key?: string;
  ip: string;
  client_version?: string;
}

export interface SftpAuthResponse {
  server: string;
  user: string;
  permissions: string[];
}

export interface BackupPart {
  etag: string;
  part_number: number;
}

export interface BackupStatusRequest {
  checksum: string;
  checksum_type: string;
  size: number;
  parts: BackupPart[];
  successful: boolean;
}

export interface InstallStatusRequest {
  successful: boolean;
  reinstall: boolean;
}

export interface ArchiveStatusRequest {
  successful: boolean;
}

export interface CommandRequest {
  command: string;
}

export interface UpdateVariablePayload {
  value: string;
}

export interface CreateDatabasePayload {
  name: string;
  remote: string;
}

export interface CreateSubuserPayload {
  email: string;
  permissions: string[];
}

export interface UpdateSubuserPayload {
  permissions: string[];
}

export interface CreateAllocationPayload {
  allocationId: string;
}

export interface UpdateAllocationPayload {
  notes?: string;
}

export interface CreateSchedulePayload {
  name: string;
  cron: {
    minute: string;
    hour: string;
    day_of_month: string;
    month: string;
    day_of_week: string;
  };
  is_active: boolean;
  only_when_online: boolean;
}

export interface UpdateSchedulePayload {
  name?: string;
  cron?: {
    minute: string;
    hour: string;
    day_of_month: string;
    month: string;
    day_of_week: string;
  };
  is_active?: boolean;
  only_when_online?: boolean;
}

export interface CreateTaskPayload {
  action: string;
  payload: string;
  time_offset?: number;
  continue_on_failure?: boolean;
}

export interface UpdateNodePayload {
  name?: string;
  description?: string;
  fqdn?: string;
  scheme?: 'http' | 'https';
  behindProxy?: boolean;
  public?: boolean;
  maintenanceMode?: boolean;
  memory?: number;
}

export interface UpdateScheduleBody {
  name?: string;
  cron?: string;
  action?: string;
  enabled?: boolean;
}

export interface UpdateTaskPayload {
  action?: string;
  payload?: string;
  time_offset?: number;
  continue_on_failure?: boolean;
}



export interface DataResponse<T> {
  data: T
}

export interface DataResponseWithMeta<T, M> {
  data: T
  meta: M
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
}

export interface ApiKeyResponse {
  data: {
    identifier: string
    description: string | null
    allowed_ips: string[]
    last_used_at: string | null
    created_at: string
  }
  meta: {
    secret_token: string
  }
}

export interface AdminUserResponse {
  id: string
  username: string
  email: string
  name: string
  role: string
  createdAt: string
}

export interface UsersResponse {
  data: AdminUserResponse[]
}

export interface StartupResponse {
  data: {
    startup: string
    dockerImage: string
    environment: Record<string, string>
  }
}

export interface WebSocketToken {
  token: string
  socket: string
}

export interface FileEntry {
  name: string
  mode: string
  mode_bits: string
  size: number
  is_file: boolean
  is_symlink: boolean
  mimetype: string
  created_at: string
  modified_at: string
}

export interface SftpAuthRequest {
  type: 'password' | 'public_key'
  username: string
  password?: string
  public_key?: string
  ip: string
  client_version?: string
}

export interface SftpAuthResponse {
  server: string
  user: string
  permissions: string[]
}

export interface BackupPart {
  etag: string
  part_number: number
}

export interface BackupStatusRequest {
  checksum: string
  checksum_type: string
  size: number
  parts: BackupPart[]
  successful: boolean
}

export interface RestoreStatusRequest {
  successful: boolean
}

export interface InstallStatusRequest {
  successful: boolean
  reinstall: boolean
}

export interface ArchiveStatusRequest {
  successful: boolean
}

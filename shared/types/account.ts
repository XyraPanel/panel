import type { BaseActivityEvent } from './audit'

export interface UpdateEmailPayload {
  email: string
  password: string
}

export interface UpdateEmailResponse {
  success: boolean
}

export interface AccountActivityItem extends BaseActivityEvent {
  target: string | null
}

export interface AccountActivityResponse {
  data: AccountActivityItem[]
  generatedAt: string
}

export interface PaginatedAccountActivityResponse {
  data: AccountActivityItem[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
  generatedAt: string
}
export interface SSHKeyManagerOptions {
  userId?: string
  skipAudit?: boolean
}

export interface SSHKeyInfo {
  id: string
  userId: string
  name: string
  fingerprint: string
  publicKey: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateSSHKeyOptions extends SSHKeyManagerOptions {
  name: string
  publicKey: string
}

export interface TotpSetupResponse {
  secret: string
  uri: string
  recoveryTokens: string[]
}

export interface TotpVerifyRequest {
  token: string
}

export interface TotpDisableRequest {
  password: string
}

export interface RecoveryTokenRequest {
  token: string
}

export interface TotpResponse {
  success: boolean
  message: string
}

export interface PasswordRequestBody {
  identity: string
}

export interface PasswordResetBody {
  token: string
  newPassword: string
}

export interface PasswordForceBody {
  newPassword: string
  confirmPassword?: string
}

export interface PasswordUpdateResponse {
  success: boolean
  revokedSessions: number
  signedOut?: boolean
  message?: string
}

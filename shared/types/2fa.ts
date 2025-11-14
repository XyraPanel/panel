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

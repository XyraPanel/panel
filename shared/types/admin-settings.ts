export interface GeneralSettings {
  name: string
  url: string
  locale: string
  timezone: string
  brandText: string
  showBrandText: boolean
  showBrandLogo: boolean
  brandLogoUrl: string | null
  customCss?: string
}

export interface MailSettings {
  driver: string
  host: string
  port: string
  username: string
  password: string
  encryption: string
  fromAddress: string
  fromName: string
}

export interface AdvancedSettings {
  telemetryEnabled: boolean
  debugMode: boolean
  recaptchaEnabled: boolean
  recaptchaSiteKey: string
  recaptchaSecretKey: string
  sessionTimeoutMinutes: number
  queueConcurrency: number
  queueRetryLimit: number
}

export interface SecuritySettings {
  enforceTwoFactor: boolean
  maintenanceMode: boolean
  maintenanceMessage: string
  announcementEnabled: boolean
  announcementMessage: string
}

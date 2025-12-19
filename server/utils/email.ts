import { createTransport } from 'nodemailer'
import type { Transporter, TransportOptions as NodemailerTransportOptions } from 'nodemailer'
import { getSettings, getSettingWithDefault, SETTINGS_KEYS } from '~~/server/utils/settings'
import type { EmailConfig } from '#shared/types/email'

let transporter: Transporter | null = null

function getAppName(): string {
  const runtimeConfig = useRuntimeConfig()
  return (runtimeConfig.public?.appName as string) || 'XyraPanel'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeService(service?: string | null): string | null {
  const trimmed = service?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function resolveEmailConfig(explicit?: EmailConfig): EmailConfig | null {
  if (explicit) {
    return explicit
  }

  const settings = getSettings([
    SETTINGS_KEYS.MAIL_SERVICE,
    SETTINGS_KEYS.MAIL_HOST,
    SETTINGS_KEYS.MAIL_PORT,
    SETTINGS_KEYS.MAIL_USERNAME,
    SETTINGS_KEYS.MAIL_PASSWORD,
    SETTINGS_KEYS.MAIL_ENCRYPTION,
  ])

  const service = sanitizeService(settings[SETTINGS_KEYS.MAIL_SERVICE])

  if (service) {
    return {
      service,
      user: settings[SETTINGS_KEYS.MAIL_USERNAME],
      pass: settings[SETTINGS_KEYS.MAIL_PASSWORD],
    }
  }

  const host = settings[SETTINGS_KEYS.MAIL_HOST]
  if (!host) {
    return null
  }

  const portValue = settings[SETTINGS_KEYS.MAIL_PORT] || '587'
  const encryption = (settings[SETTINGS_KEYS.MAIL_ENCRYPTION] || 'tls').toLowerCase()
  const secure = encryption === 'ssl' || encryption === '465' || encryption === 'smtps' || encryption === 'true'

  return {
    host,
    port: Number.parseInt(String(portValue), 10) || (secure ? 465 : 587),
    secure,
    user: settings[SETTINGS_KEYS.MAIL_USERNAME],
    pass: settings[SETTINGS_KEYS.MAIL_PASSWORD],
  }
}

export function initializeEmailService(config?: EmailConfig): void {
  const emailConfig = resolveEmailConfig(config)

  if (!emailConfig) {
    transporter = null
    console.warn('Email service configuration is incomplete; transport not initialized')
    return
  }

  if (emailConfig.service) {
    transporter = createTransport({
      service: emailConfig.service,
      auth: emailConfig.user && emailConfig.pass ? {
        user: emailConfig.user,
        pass: emailConfig.pass,
      } : undefined,
    } as NodemailerTransportOptions)
    return
  }

  transporter = createTransport({
    host: emailConfig.host!,
    port: emailConfig.port ?? 587,
    secure: emailConfig.secure ?? false,
    auth: emailConfig.user && emailConfig.pass ? {
      user: emailConfig.user,
      pass: emailConfig.pass,
    } : undefined,
  })
}

export function refreshEmailService(): void {
  initializeEmailService()
}

function ensureEmailServiceInitialized(): void {
  if (!transporter) {
    refreshEmailService()
  }
}

export function resolvePanelBaseUrl(): string {
  const base = process.env.AUTH_ORIGIN
    || process.env.NUXT_AUTH_ORIGIN
    || process.env.NUXT_PUBLIC_APP_URL
    || process.env.APP_URL
    || 'http://localhost:3000'

  return base.replace(/\/$/, '')
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  ensureEmailServiceInitialized()

  if (!transporter) {
    console.warn('Email service not initialized, skipping email send')
    return
  }

  const appName = getAppName()
  const fromAddress = getSettingWithDefault(SETTINGS_KEYS.MAIL_FROM_ADDRESS, 'noreply@xyrapanel.local')
  const fromName = getSettingWithDefault(SETTINGS_KEYS.MAIL_FROM_NAME, appName)
  const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  })
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  resetUrl: string
): Promise<void> {
  const html = `
    <h2>Password Reset Request</h2>
    <p>You requested a password reset for your ${getAppName()} account.</p>
    <p>Click the link below to reset your password:</p>
    <p><a href="${resetUrl}?token=${resetToken}">Reset Password</a></p>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `

  await sendEmail({
    to: email,
    subject: 'Password Reset Request',
    html,
  })
}

export async function sendEmailVerificationEmail(options: {
  to: string
  token: string
  expiresAt: Date
  username?: string | null
}): Promise<void> {
  const baseUrl = resolvePanelBaseUrl()
  const verifyUrl = `${baseUrl}/auth/email/verify?token=${encodeURIComponent(options.token)}`

  const htmlLines = [
    `<h2>Verify your ${getAppName()} email address</h2>`,
    options.username
      ? `<p>Hi ${escapeHtml(options.username)},</p>`
      : '<p>Hello,</p>',
    '<p>We need to confirm this email address belongs to you. Click the button below to finish verifying your account.</p>',
    `<p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Verify email address</a></p>`,
    `<p>If the button does not work, copy and paste this link into your browser:</p>`,
    `<p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    '<p>This link will expire in 24 hours.</p>',
    '<p>If you did not request this, you can safely ignore this email.</p>',
  ]

  await sendEmail({
    to: options.to,
    subject: 'Verify your email address',
    html: htmlLines.join('\n'),
  })
}

export async function sendWelcomeEmail(
  email: string,
  name: string
): Promise<void> {
  const html = `
    <h2>Welcome to ${getAppName()}!</h2>
    <p>Hi ${name},</p>
    <p>Your account has been created successfully.</p>
    <p>You can now log in and start managing your servers.</p>
    <p>If you have any questions, please don't hesitate to contact support.</p>
  `

  await sendEmail({
    to: email,
    subject: `Welcome to ${getAppName()}`,
    html,
  })
}

export async function sendServerCreatedEmail(
  email: string,
  serverName: string,
  serverUuid: string
): Promise<void> {
  const html = `
    <h2>Server Created</h2>
    <p>Your server "${serverName}" has been created successfully.</p>
    <p>Server UUID: ${serverUuid}</p>
    <p>You can now access your server from the panel.</p>
  `

  await sendEmail({
    to: email,
    subject: `Server Created: ${serverName}`,
    html,
  })
}

export async function sendBackupCompletedEmail(
  email: string,
  serverName: string,
  backupName: string
): Promise<void> {
  const html = `
    <h2>Backup Completed</h2>
    <p>A backup for server "${serverName}" has been completed.</p>
    <p>Backup: ${backupName}</p>
    <p>You can download it from the panel.</p>
  `

  await sendEmail({
    to: email,
    subject: `Backup Completed: ${serverName}`,
    html,
  })
}

export async function sendServerSuspendedEmail(
  email: string,
  serverName: string,
  reason?: string
): Promise<void> {
  const html = `
    <h2>Server Suspended</h2>
    <p>Your server "${serverName}" has been suspended.</p>
    ${reason ? `<p>Reason: ${reason}</p>` : ''}
    <p>Please contact support if you have any questions.</p>
  `

  await sendEmail({
    to: email,
    subject: `Server Suspended: ${serverName}`,
    html,
  })
}

export async function sendServerReinstalledEmail(
  email: string,
  serverName: string,
  serverUuid: string
): Promise<void> {
  const html = `
    <h2>Server Reinstalled</h2>
    <p>Your server "${serverName}" has been reinstalled successfully.</p>
    <p>Server UUID: ${serverUuid}</p>
    <p>You can now access your server from the panel.</p>
  `

  await sendEmail({
    to: email,
    subject: `Server Reinstalled: ${serverName}`,
    html,
  })
}

export async function sendAdminUserCreatedEmail(options: {
  to: string
  username: string
  temporaryPassword?: string
}): Promise<void> {
  const baseUrl = resolvePanelBaseUrl()
  const loginUrl = `${baseUrl}/auth/login`

  const bodyLines = [
    `<h2>Your ${getAppName()} account is ready</h2>`,
    `<p>An administrator has created an account for you with username <strong>${options.username}</strong>.</p>`,
  ]

  if (options.temporaryPassword) {
    bodyLines.push('<p>A temporary password has been generated for you:</p>')
    bodyLines.push(`<p><strong>${options.temporaryPassword}</strong></p>`)
    bodyLines.push('<p>Please sign in and change this password immediately from your account security settings.</p>')
  }
  else {
    bodyLines.push('<p>Please sign in using the credentials provided by your administrator.</p>')
  }

  bodyLines.push(`<p>You can access the panel here: <a href="${loginUrl}">${loginUrl}</a></p>`) 

  await sendEmail({
    to: options.to,
    subject: `Your ${getAppName()} account has been created`,
    html: bodyLines.join('\n'),
  })
}

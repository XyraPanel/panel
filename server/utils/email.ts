

import { createTransport } from 'nodemailer'
import type { Transporter } from 'nodemailer'

let transporter: Transporter | null = null

export function initializeEmailService(config?: {
  host?: string
  port?: number
  secure?: boolean
  user?: string
  pass?: string
}): void {
  const emailConfig = config || {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }

  transporter = createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    auth: emailConfig.user && emailConfig.pass ? {
      user: emailConfig.user,
      pass: emailConfig.pass,
    } : undefined,
  })
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  if (!transporter) {
    console.warn('Email service not initialized, skipping email send')
    return
  }

  const from = process.env.SMTP_FROM || 'noreply@xyrapanel.com'

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html.replace(/<[^>]*>/g, ''),
  })
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  resetUrl: string
): Promise<void> {
  const html = `
    <h2>Password Reset Request</h2>
    <p>You requested a password reset for your XyraPanel account.</p>
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

export async function sendWelcomeEmail(
  email: string,
  name: string
): Promise<void> {
  const html = `
    <h2>Welcome to XyraPanel!</h2>
    <p>Hi ${name},</p>
    <p>Your account has been created successfully.</p>
    <p>You can now log in and start managing your servers.</p>
    <p>If you have any questions, please don't hesitate to contact support.</p>
  `

  await sendEmail({
    to: email,
    subject: 'Welcome to XyraPanel',
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

import { createTransport } from 'nodemailer';
import type { Transporter, TransportOptions as NodemailerTransportOptions } from 'nodemailer';
import { getSettings, getSettingWithDefault, SETTINGS_KEYS } from '#server/utils/settings';
import type { EmailConfig } from '#shared/types/email';
import {
  renderPasswordResetTemplate,
  renderEmailVerificationTemplate,
  renderWelcomeTemplate,
  renderServerCreatedTemplate,
  renderBackupCompletedTemplate,
  renderServerSuspendedTemplate,
  renderServerReinstalledTemplate,
  renderAdminUserCreatedTemplate,
} from '#server/utils/email-templates';

let transporter: Transporter | null = null;

function getAppName(): string {
  const runtimeConfig = useRuntimeConfig();
  return (runtimeConfig.public?.appName as string) || 'XyraPanel';
}

function sanitizeService(service?: string | null): string | null {
  const trimmed = service?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

async function resolveEmailConfig(explicit?: EmailConfig): Promise<EmailConfig | null> {
  if (explicit) {
    return explicit;
  }

  const settings = await getSettings([
    SETTINGS_KEYS.MAIL_SERVICE,
    SETTINGS_KEYS.MAIL_HOST,
    SETTINGS_KEYS.MAIL_PORT,
    SETTINGS_KEYS.MAIL_USERNAME,
    SETTINGS_KEYS.MAIL_PASSWORD,
    SETTINGS_KEYS.MAIL_ENCRYPTION,
  ]);

  const service = sanitizeService(settings[SETTINGS_KEYS.MAIL_SERVICE]);

  if (service) {
    return {
      service,
      user: settings[SETTINGS_KEYS.MAIL_USERNAME],
      pass: settings[SETTINGS_KEYS.MAIL_PASSWORD],
    };
  }

  const host = settings[SETTINGS_KEYS.MAIL_HOST];
  if (!host) {
    return null;
  }

  const portValue = settings[SETTINGS_KEYS.MAIL_PORT] || '587';
  const encryption = (settings[SETTINGS_KEYS.MAIL_ENCRYPTION] || 'tls').toLowerCase();
  const secure =
    encryption === 'ssl' || encryption === '465' || encryption === 'smtps' || encryption === 'true';

  return {
    host,
    port: Number.parseInt(String(portValue), 10) || (secure ? 465 : 587),
    secure,
    user: settings[SETTINGS_KEYS.MAIL_USERNAME],
    pass: settings[SETTINGS_KEYS.MAIL_PASSWORD],
  };
}

export async function initializeEmailService(config?: EmailConfig): Promise<void> {
  const emailConfig = await resolveEmailConfig(config);

  if (!emailConfig) {
    transporter = null;
    if (process.env.NODE_ENV === 'production') {
      console.warn('Email service configuration is incomplete; transport not initialized');
    }
    return;
  }

  if (emailConfig.service) {
    transporter = createTransport({
      service: emailConfig.service,
      auth:
        emailConfig.user && emailConfig.pass
          ? {
              user: emailConfig.user,
              pass: emailConfig.pass,
            }
          : undefined,
    } as NodemailerTransportOptions);
    return;
  }

  transporter = createTransport({
    host: emailConfig.host!,
    port: emailConfig.port ?? 587,
    secure: emailConfig.secure ?? false,
    auth:
      emailConfig.user && emailConfig.pass
        ? {
            user: emailConfig.user,
            pass: emailConfig.pass,
          }
        : undefined,
  });
}

export async function refreshEmailService(): Promise<void> {
  await initializeEmailService();
}

async function ensureEmailServiceInitialized(): Promise<void> {
  if (!transporter) {
    await refreshEmailService();
  }
}

export async function isEmailConfigured(): Promise<boolean> {
  await ensureEmailServiceInitialized();
  return transporter !== null;
}

export function resolvePanelBaseUrl(): string {
  const base =
    process.env.AUTH_ORIGIN ||
    process.env.NUXT_AUTH_ORIGIN ||
    process.env.NUXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'http://localhost:3000';

  return base.replace(/\/$/, '');
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  await ensureEmailServiceInitialized();

  if (!transporter) {
    console.warn('Email service not initialized, skipping email send');
    return;
  }

  const appName = getAppName();
  const fromAddress = await getSettingWithDefault(
    SETTINGS_KEYS.MAIL_FROM_ADDRESS,
    'noreply@xyrapanel.local',
  );
  const fromName = await getSettingWithDefault(SETTINGS_KEYS.MAIL_FROM_NAME, appName);
  const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  resetUrl: string,
): Promise<void> {
  const template = await renderPasswordResetTemplate({
    resetUrl: `${resetUrl}?token=${resetToken}`,
    expiresIn: '1 hour',
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });
}

export async function sendEmailVerificationEmail(options: {
  to: string;
  token: string;
  expiresAt: Date;
  username?: string | null;
}): Promise<void> {
  const baseUrl = resolvePanelBaseUrl();
  const verifyUrl = `${baseUrl}/auth/email/verify?token=${encodeURIComponent(options.token)}`;

  const template = await renderEmailVerificationTemplate({
    verifyUrl,
    username: options.username,
  });

  await sendEmail({
    to: options.to,
    subject: template.subject,
    html: template.html,
  });
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const baseUrl = resolvePanelBaseUrl();
  const template = await renderWelcomeTemplate({
    name,
    panelUrl: baseUrl,
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });
}

export async function sendServerCreatedEmail(
  email: string,
  serverName: string,
  serverUuid: string,
): Promise<void> {
  const baseUrl = resolvePanelBaseUrl();
  const template = await renderServerCreatedTemplate({
    serverName,
    serverUuid,
    panelUrl: baseUrl,
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });
}

export async function sendBackupCompletedEmail(
  email: string,
  serverName: string,
  backupName: string,
): Promise<void> {
  const baseUrl = resolvePanelBaseUrl();
  const template = await renderBackupCompletedTemplate({
    serverName,
    backupName,
    panelUrl: baseUrl,
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });
}

export async function sendServerSuspendedEmail(
  email: string,
  serverName: string,
  reason?: string,
): Promise<void> {
  const baseUrl = resolvePanelBaseUrl();
  const supportUrl = `${baseUrl}/support`;
  const template = await renderServerSuspendedTemplate({
    serverName,
    reason,
    supportUrl,
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });
}

export async function sendServerReinstalledEmail(
  email: string,
  serverName: string,
  serverUuid: string,
): Promise<void> {
  const baseUrl = resolvePanelBaseUrl();
  const template = await renderServerReinstalledTemplate({
    serverName,
    serverUuid,
    panelUrl: baseUrl,
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    html: template.html,
  });
}

export async function sendAdminUserCreatedEmail(options: {
  to: string;
  username: string;
  temporaryPassword?: string;
}): Promise<void> {
  const baseUrl = resolvePanelBaseUrl();
  const loginUrl = `${baseUrl}/auth/login`;

  const template = await renderAdminUserCreatedTemplate({
    username: options.username,
    temporaryPassword: options.temporaryPassword,
    loginUrl,
  });

  await sendEmail({
    to: options.to,
    subject: template.subject,
    html: template.html,
  });
}

import { useDrizzle, tables, eq } from '#server/utils/drizzle';

interface TemplateData {
  [key: string]: string | number | boolean | null | undefined;
}

interface CompiledTemplate {
  subject: string;
  html: string;
  text?: string;
}

const templateCache = new Map<string, { html: string; subject: string }>();

export async function getTemplate(name: string): Promise<{ html: string; subject: string }> {
  if (templateCache.has(name)) {
    return templateCache.get(name)!;
  }

  const db = useDrizzle();
  const templateRows = await db
    .select({
      htmlContent: tables.emailTemplates.htmlContent,
      subject: tables.emailTemplates.subject,
    })
    .from(tables.emailTemplates)
    .where(eq(tables.emailTemplates.templateId, name))
    .limit(1);

  const [dbTemplate] = templateRows;

  if (dbTemplate) {
    const result = { html: dbTemplate.htmlContent, subject: dbTemplate.subject };
    templateCache.set(name, result);
    return result;
  }

  throw new Error(`Template "${name}" not found in database`);
}

function getCommonData(): TemplateData {
  const runtimeConfig = useRuntimeConfig();
  return {
    appName: (runtimeConfig.public?.appName as string) || 'XyraPanel',
    year: new Date().getFullYear(),
  };
}

function interpolateTemplate(template: string, data: TemplateData): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value));
    }
  }
  return result;
}

export async function renderEmailTemplate(
  templateName: string,
  data: TemplateData,
): Promise<CompiledTemplate> {
  const template = await getTemplate(templateName);
  const commonData = getCommonData();
  const mergedData = { ...commonData, ...data };

  const html = interpolateTemplate(template.html, mergedData);

  return {
    subject: (data.subject as string) || template.subject || 'Message from ' + mergedData.appName,
    html,
  };
}

export async function renderPasswordResetTemplate(data: {
  resetUrl: string;
  expiresIn?: string;
  subject?: string;
}): Promise<CompiledTemplate> {
  return renderEmailTemplate('password-reset', {
    resetUrl: data.resetUrl,
    expiresIn: data.expiresIn || '1 hour',
    subject: data.subject || 'Password Reset Request',
  });
}

export async function renderEmailVerificationTemplate(data: {
  verifyUrl: string;
  username?: string | null;
  subject?: string;
}): Promise<CompiledTemplate> {
  return renderEmailTemplate('email-verification', {
    verifyUrl: data.verifyUrl,
    username: data.username || null,
    subject: data.subject || 'Verify your email address',
  });
}

export async function renderWelcomeTemplate(data: {
  name: string;
  panelUrl: string;
  subject?: string;
}): Promise<CompiledTemplate> {
  return renderEmailTemplate('welcome', {
    name: data.name,
    panelUrl: data.panelUrl,
    subject: data.subject || `Welcome to XyraPanel!`,
  });
}

export async function renderServerCreatedTemplate(data: {
  serverName: string;
  serverUuid: string;
  serverType?: string;
  createdAt?: string;
  panelUrl: string;
  subject?: string;
}): Promise<CompiledTemplate> {
  return renderEmailTemplate('server-created', {
    serverName: data.serverName,
    serverUuid: data.serverUuid,
    serverType: data.serverType || null,
    createdAt: data.createdAt || null,
    panelUrl: data.panelUrl,
    subject: data.subject || `Server Created: ${data.serverName}`,
  });
}

export async function renderBackupCompletedTemplate(data: {
  serverName: string;
  backupName: string;
  backupSize?: string;
  completedAt?: string;
  panelUrl: string;
  subject?: string;
}): Promise<CompiledTemplate> {
  return renderEmailTemplate('backup-completed', {
    serverName: data.serverName,
    backupName: data.backupName,
    backupSize: data.backupSize || null,
    completedAt: data.completedAt || null,
    panelUrl: data.panelUrl,
    subject: data.subject || `Backup Completed: ${data.serverName}`,
  });
}

export async function renderServerSuspendedTemplate(data: {
  serverName: string;
  reason?: string;
  suspendedAt?: string;
  supportUrl: string;
  subject?: string;
}): Promise<CompiledTemplate> {
  return renderEmailTemplate('server-suspended', {
    serverName: data.serverName,
    reason: data.reason || null,
    suspendedAt: data.suspendedAt || null,
    supportUrl: data.supportUrl,
    subject: data.subject || `Server Suspended: ${data.serverName}`,
  });
}

export async function renderServerReinstalledTemplate(data: {
  serverName: string;
  serverUuid: string;
  reinstalledAt?: string;
  panelUrl: string;
  subject?: string;
}): Promise<CompiledTemplate> {
  return renderEmailTemplate('server-reinstalled', {
    serverName: data.serverName,
    serverUuid: data.serverUuid,
    reinstalledAt: data.reinstalledAt || null,
    panelUrl: data.panelUrl,
    subject: data.subject || `Server Reinstalled: ${data.serverName}`,
  });
}

export async function renderAdminUserCreatedTemplate(data: {
  username: string;
  temporaryPassword?: string;
  loginUrl: string;
  subject?: string;
}): Promise<CompiledTemplate> {
  return renderEmailTemplate('admin-user-created', {
    username: data.username,
    temporaryPassword: data.temporaryPassword || null,
    loginUrl: data.loginUrl,
    subject: data.subject || `Your XyraPanel account has been created`,
  });
}

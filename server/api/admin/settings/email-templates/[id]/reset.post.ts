import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';

const defaultTemplates: Record<string, string> = {
  'password-reset': `<h1>Password Reset Request</h1><p>Hello,</p><p>You requested a password reset for your <strong>{{ appName }}</strong> account.</p><p>Click the button below to reset your password:</p><p><a href="{{ resetUrl }}" class="button">Reset Password</a></p><p>Or copy and paste this link into your browser:</p><p><a href="{{ resetUrl }}">{{ resetUrl }}</a></p><p><strong>⏱️ Link Expires:</strong> This link will expire in {{ expiresIn }}.</p><p>If you didn't request this, please ignore this email and your password will remain unchanged.</p><p>For security reasons, never share this link with anyone.</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>`,
  'email-verification': `<h1>Verify Your Email Address</h1><p>Hi {{ username }},</p><p>We need to confirm this email address belongs to you. Click the button below to finish verifying your account.</p><p><a href="{{ verifyUrl }}" class="button">Verify Email Address</a></p><p>If the button does not work, copy and paste this link into your browser:</p><p><a href="{{ verifyUrl }}">{{ verifyUrl }}</a></p><p><strong>⏱️ Link Expires:</strong> This link will expire in 24 hours.</p><p>If you did not request this, you can safely ignore this email.</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>`,
  welcome: `<h1>Welcome to {{ appName }}!</h1><p>Hi {{ name }},</p><p>Your account has been created successfully. We're excited to have you on board!</p><p><a target="_blank" rel="noopener noreferrer nofollow" class="button" href="{{ panelUrl }}">Access Your Panel</a></p><h3>What you can do now:</h3><ul><li><p>Manage your game servers</p></li><li><p>Monitor server performance</p></li><li><p>Configure server settings</p></li><li><p>Manage users and permissions</p></li><li><p>View activity logs</p></li></ul><p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>`,
  'server-created': `<h1>🎮 Server Created</h1><p>Hello,</p><p>Your server <strong>{{ serverName }}</strong> has been created successfully!</p><p>Server Name: {{ serverName }}</p><p>Server UUID: {{ serverUuid }}</p><p>You can now access your server from the panel and start configuring it.</p><p><a href="{{ panelUrl }}" class="button">Go to Panel</a></p><p>Happy gaming! 🚀</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>`,
  'backup-completed': `<h1>✅ Backup Completed</h1><p>Hello,</p><p><strong>A backup for server "{{ serverName }}" has been completed successfully!</strong></p><p>Server: {{ serverName }}</p><p>Backup Name: {{ backupName }}</p><p>You can download or restore this backup from the panel.</p><p><a href="{{ panelUrl }}" class="button">View Backup</a></p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>`,
  'server-suspended': `<h1>⚠️ Server Suspended</h1><p>Hello,</p><p><strong>Your server "{{ serverName }}" has been suspended.</strong></p><p>Server: {{ serverName }}</p><p>Please contact support if you have any questions or need assistance.</p><p><a href="{{ supportUrl }}" class="button">Contact Support</a></p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>`,
  'server-reinstalled': `<h1>🔄 Server Reinstalled</h1><p>Hello,</p><p><strong>Your server "{{ serverName }}" has been reinstalled successfully!</strong></p><p>Server: {{ serverName }}</p><p>Server UUID: {{ serverUuid }}</p><p>You can now access your server from the panel and start configuring it again.</p><p><a href="{{ panelUrl }}" class="button">Go to Panel</a></p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>`,
  'admin-user-created': `<h1>Account Created</h1><p>Hello,</p><p>An administrator has created an account for you on <strong>{{ appName }}</strong>.</p><p>Username: {{ username }}</p><p>A temporary password has been generated for you:</p><p>{{ temporaryPassword }}</p><p><strong>⚠️ Important:</strong> Please sign in and change this password immediately from your account security settings.</p><p><a href="{{ loginUrl }}" class="button">Sign In to Panel</a></p><p>If you have any questions, please contact your administrator.</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>`,
};

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Reset an email template to default',
    description:
      'Overwrites a stored email template with its built-in default HTML content. Requires an admin session with the panel_settings:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Template ID, e.g. "password-reset"' },
    ],
    responses: {
      '200': {
        description: 'Template reset',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    message: { type: 'string' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
      '400': { description: 'Missing template ID' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:write ACL permission' },
      '404': { description: 'No default template exists for this ID, or the stored template was not found' },
      '500': { description: 'Failed to reset template' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.PANEL_SETTINGS,
    ADMIN_ACL_PERMISSIONS.WRITE,
  );

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      status: 400,
      message: 'Template ID is required',
    });
  }

  if (!defaultTemplates[id]) {
    throw createError({
      status: 404,
      message: `No default template found for "${id}"`,
    });
  }

  try {
    const db = useDrizzle();
    const now = new Date().toISOString();

    const updated = await db
      .update(tables.emailTemplates)
      .set({
        htmlContent: defaultTemplates[id],
        updatedAt: now,
      })
      .where(eq(tables.emailTemplates.templateId, id))
      .returning({ templateId: tables.emailTemplates.templateId });

    if (updated.length === 0) {
      throw createError({
        status: 404,
        message: `Template "${id}" not found`,
      });
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.email_template.reset',
      targetType: 'settings',
      metadata: {
        templateId: id,
      },
    });

    return {
      data: {
        id,
        message: 'Template reset to default successfully',
        updatedAt: now,
      },
    };
  } catch (err) {
    if (err && typeof err === 'object' && ('statusCode' in err || 'status' in err)) {
      throw err;
    }

    throw createError({
      status: 500,
      message: `Failed to reset template: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }
});

import { requireAdmin } from '#server/utils/security';
import { logger } from '#server/utils/logger';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Send a test email',
    description:
      'Sends a test email to the current admin using the configured mail settings, to verify the setup works. Requires an admin session with the panel_settings:read ACL permission.',
    responses: {
      '200': {
        description: 'Test email sent',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:read ACL permission' },
      '500': { description: 'Failed to send test email' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.PANEL_SETTINGS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  try {
    const { sendEmail } = await import('#server/utils/email');

    const appName = useRuntimeConfig().public.appName || 'XyraPanel';
    await sendEmail({
      to: session.user.email || 'admin@example.com',
      subject: `${appName} - Test Email`,
      html: `
        <h2>Test Email</h2>
        <p>This is a test email from ${appName}.</p>
        <p>If you received this, your email configuration is working correctly!</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      `,
    });

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.mail.test_sent',
      targetType: 'user',
      targetId: session.user.id,
    });

    return {
      data: {
        success: true,
        message: 'Test email sent successfully',
      },
    };
  } catch (error) {
    logger.error('Failed to send test email:', error);
    throw createError({
      status: 500,
      message: error instanceof Error ? error.message : 'Failed to send test email',
    });
  }
});

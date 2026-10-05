import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'List email template definitions',
    description:
      'Returns the static catalog of email templates (id, name, description, and interpolation variables) available for editing. Requires an admin session with the panel_settings:read ACL permission.',
    responses: {
      '200': {
        description: 'List of email template definitions',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      variables: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:read ACL permission' },
    },
  },
});

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  await requireAdminApiKeyPermission(
    event,
    ADMIN_ACL_RESOURCES.PANEL_SETTINGS,
    ADMIN_ACL_PERMISSIONS.READ,
  );

  const templates = [
    {
      id: 'password-reset',
      name: 'Password Reset',
      description: 'Sent when a user requests a password reset',
      variables: ['resetUrl', 'expiresIn', 'appName', 'year'],
    },
    {
      id: 'email-verification',
      name: 'Email Verification',
      description: 'Sent when a user needs to verify their email address',
      variables: ['verifyUrl', 'username', 'appName', 'year'],
    },
    {
      id: 'welcome',
      name: 'Welcome',
      description: 'Sent when a new user account is created',
      variables: ['name', 'panelUrl', 'appName', 'year'],
    },
    {
      id: 'server-created',
      name: 'Server Created',
      description: 'Sent when a server is successfully created',
      variables: [
        'serverName',
        'serverUuid',
        'serverType',
        'createdAt',
        'panelUrl',
        'appName',
        'year',
      ],
    },
    {
      id: 'backup-completed',
      name: 'Backup Completed',
      description: 'Sent when a server backup is completed',
      variables: [
        'serverName',
        'backupName',
        'backupSize',
        'completedAt',
        'panelUrl',
        'appName',
        'year',
      ],
    },
    {
      id: 'server-suspended',
      name: 'Server Suspended',
      description: 'Sent when a server is suspended',
      variables: ['serverName', 'reason', 'suspendedAt', 'supportUrl', 'appName', 'year'],
    },
    {
      id: 'server-reinstalled',
      name: 'Server Reinstalled',
      description: 'Sent when a server is reinstalled',
      variables: ['serverName', 'serverUuid', 'reinstalledAt', 'panelUrl', 'appName', 'year'],
    },
    {
      id: 'admin-user-created',
      name: 'Admin User Created',
      description: 'Sent when an admin creates a new user account',
      variables: ['username', 'temporaryPassword', 'loginUrl', 'appName', 'year'],
    },
  ];

  return {
    data: templates,
  };
});

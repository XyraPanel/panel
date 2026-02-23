import { requireAdmin } from '#server/utils/security';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

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

export interface DefaultEmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
}

export const defaultEmailTemplates: DefaultEmailTemplate[] = [
  {
    id: 'password-reset',
    name: 'Password Reset',
    subject: 'Password Reset Request',
    html: '<h1>Password Reset Request</h1><p>Hello,</p><p>You requested a password reset for your <strong>{{ appName }}</strong> account.</p><p>Click the button below to reset your password:</p><p><a href="{{ resetUrl }}" class="button">Reset Password</a></p><p>Or copy and paste this link into your browser:</p><p><a href="{{ resetUrl }}">{{ resetUrl }}</a></p><p><strong>⏱️ Link Expires:</strong> This link will expire in {{ expiresIn }}.</p><p>If you didn\'t request this, please ignore this email and your password will remain unchanged.</p><p>For security reasons, never share this link with anyone.</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>',
  },
  {
    id: 'email-verification',
    name: 'Email Verification',
    subject: 'Verify your email address',
    html: '<h1>Verify Your Email Address</h1><p>Hi {{ username }},</p><p>We need to confirm this email address belongs to you. Click the button below to finish verifying your account.</p><p><a href="{{ verifyUrl }}" class="button">Verify Email Address</a></p><p>If the button does not work, copy and paste this link into your browser:</p><p><a href="{{ verifyUrl }}">{{ verifyUrl }}</a></p><p><strong>⏱️ Link Expires:</strong> This link will expire in 24 hours.</p><p>If you did not request this, you can safely ignore this email.</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>',
  },
  {
    id: 'welcome',
    name: 'Welcome',
    subject: 'Welcome to XyraPanel!',
    html: '<h1>Welcome to {{ appName }}!</h1><p>Hi {{ name }},</p><p>Your account has been created successfully. We\'re excited to have you on board!</p><p><a target="_blank" rel="noopener noreferrer nofollow" class="button" href="{{ panelUrl }}">Access Your Panel</a></p><h3>What you can do now:</h3><ul><li><p>Manage your game servers</p></li><li><p>Monitor server performance</p></li><li><p>Configure server settings</p></li><li><p>Manage users and permissions</p></li><li><p>View activity logs</p></li></ul><p>If you have any questions or need assistance, please don\'t hesitate to contact our support team.</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>',
  },
  {
    id: 'server-created',
    name: 'Server Created',
    subject: 'Server Created: {{ serverName }}',
    html: '<h1>🎮 Server Created</h1><p>Hello,</p><p>Your server <strong>{{ serverName }}</strong> has been created successfully!</p><p>Server Name: {{ serverName }}</p><p>Server UUID: {{ serverUuid }}</p><p>You can now access your server from the panel and start configuring it.</p><p><a href="{{ panelUrl }}" class="button">Go to Panel</a></p><p>Happy gaming! 🚀</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>',
  },
  {
    id: 'backup-completed',
    name: 'Backup Completed',
    subject: 'Backup Completed: {{ serverName }}',
    html: '<h1>✅ Backup Completed</h1><p>Hello,</p><p><strong>A backup for server "{{ serverName }}" has been completed successfully!</strong></p><p>Server: {{ serverName }}</p><p>Backup Name: {{ backupName }}</p><p>You can download or restore this backup from the panel.</p><p><a href="{{ panelUrl }}" class="button">View Backup</a></p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>',
  },
  {
    id: 'server-suspended',
    name: 'Server Suspended',
    subject: 'Server Suspended: {{ serverName }}',
    html: '<h1>⚠️ Server Suspended</h1><p>Hello,</p><p><strong>Your server "{{ serverName }}" has been suspended.</strong></p><p>Server: {{ serverName }}</p><p>Please contact support if you have any questions or need assistance.</p><p><a href="{{ supportUrl }}" class="button">Contact Support</a></p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>',
  },
  {
    id: 'server-reinstalled',
    name: 'Server Reinstalled',
    subject: 'Server Reinstalled: {{ serverName }}',
    html: '<h1>🔄 Server Reinstalled</h1><p>Hello,</p><p><strong>Your server "{{ serverName }}" has been reinstalled successfully!</strong></p><p>Server: {{ serverName }}</p><p>Server UUID: {{ serverUuid }}</p><p>You can now access your server from the panel and start configuring it again.</p><p><a href="{{ panelUrl }}" class="button">Go to Panel</a></p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>',
  },
  {
    id: 'admin-user-created',
    name: 'Admin User Created',
    subject: 'Account Created',
    html: '<h1>Account Created</h1><p>Hello,</p><p>An administrator has created an account for you on <strong>{{ appName }}</strong>.</p><p>Username: {{ username }}</p><p>A temporary password has been generated for you:</p><p>{{ temporaryPassword }}</p><p><strong>⚠️ Important:</strong> Please sign in and change this password immediately from your account security settings.</p><p><a href="{{ loginUrl }}" class="button">Sign In to Panel</a></p><p>If you have any questions, please contact your administrator.</p><p>© {{ year }} {{ appName }}. All rights reserved.</p><p>This is an automated message, please do not reply to this email.</p>',
  },
];

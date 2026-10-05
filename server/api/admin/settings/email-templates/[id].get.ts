import { requireAdmin } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Get an email template',
    description:
      'Returns the stored HTML content of a single email template. Requires an admin session with the panel_settings:read ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Template ID, e.g. "password-reset"' },
    ],
    responses: {
      '200': {
        description: 'Email template content',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    content: { type: 'string' },
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
      '403': { description: 'Not an admin, or missing panel_settings:read ACL permission' },
      '404': { description: 'Template not found' },
      '500': { description: 'Failed to retrieve template' },
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      status: 400,
      message: 'Template ID is required',
    });
  }

  try {
    const db = useDrizzle();
    const templateRows = await db
      .select({
        htmlContent: tables.emailTemplates.htmlContent,
        updatedAt: tables.emailTemplates.updatedAt,
      })
      .from(tables.emailTemplates)
      .where(eq(tables.emailTemplates.templateId, id))
      .limit(1);

    const template = templateRows[0];

    if (!template) {
      throw createError({
        status: 404,
        message: `Template "${id}" not found`,
      });
    }

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.email_template.viewed',
      targetType: 'settings',
      metadata: {
        templateId: id,
      },
    });

    return {
      data: {
        id,
        content: template.htmlContent,
        updatedAt: new Date(template.updatedAt),
      },
    };
  } catch (err) {
    if (err && typeof err === 'object' && ('statusCode' in err || 'status' in err)) {
      throw err;
    }
    throw createError({
      status: 500,
      message: `Failed to retrieve template: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }
});

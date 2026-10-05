import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { requireAdminApiKeyPermission } from '#server/utils/admin-api-permissions';
import { ADMIN_ACL_RESOURCES, ADMIN_ACL_PERMISSIONS } from '#server/utils/admin-acl';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { emailTemplateUpdateSchema } from '#shared/schema/admin/settings';

defineRouteMeta({
  openAPI: {
    tags: ['Admin - Settings'],
    summary: 'Update an email template',
    description:
      'Overwrites the HTML content of an email template. Requires an admin session with the panel_settings:write ACL permission.',
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Template ID, e.g. "password-reset"' },
    ],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['content'],
            properties: {
              content: { type: 'string', description: 'New HTML content for the template' },
            },
          },
        },
      },
    },
    responses: {
      '200': {
        description: 'Template updated',
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
      '400': { description: 'Missing template ID, or invalid request body' },
      '401': { description: 'Not authenticated' },
      '403': { description: 'Not an admin, or missing panel_settings:write ACL permission' },
      '404': { description: 'Template not found' },
      '500': { description: 'Failed to update template' },
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

  const body = await readValidatedBodyWithLimit(
    event,
    emailTemplateUpdateSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const db = useDrizzle();
    const now = new Date().toISOString();

    const updated = await db
      .update(tables.emailTemplates)
      .set({
        htmlContent: body.content,
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
      action: 'admin.email_template.updated',
      targetType: 'settings',
      metadata: {
        templateId: id,
      },
    });

    return {
      data: {
        id,
        message: 'Template updated successfully',
        updatedAt: now,
      },
    };
  } catch (err) {
    if (err && typeof err === 'object' && ('statusCode' in err || 'status' in err)) {
      throw err;
    }

    throw createError({
      status: 500,
      message: `Failed to update template: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }
});

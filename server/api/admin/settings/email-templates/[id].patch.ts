import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { emailTemplateUpdateSchema } from '#shared/schema/admin/settings';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      status: 400,
      statusText: 'Template ID is required',
    });
  }

  const body = await readValidatedBodyWithLimit(
    event,
    emailTemplateUpdateSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const db = useDrizzle();
    const now = new Date();

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
        statusText: `Template "${id}" not found`,
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
      statusText: `Failed to update template: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }
});

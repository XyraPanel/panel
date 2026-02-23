import { requireAdmin } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      status: 400,
      statusText: 'Template ID is required',
    });
  }

  try {
    const db = useDrizzle();
    const templateRows = await db
      .select()
      .from(tables.emailTemplates)
      .where(eq(tables.emailTemplates.templateId, id))
      .limit(1);

    const [template] = templateRows as { htmlContent: string; updatedAt: Date }[];

    if (!template) {
      throw createError({
        status: 404,
        statusText: `Template "${id}" not found`,
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
        updatedAt: template.updatedAt,
      },
    };
  } catch (err) {
    if (err && typeof err === 'object' && ('statusCode' in err || 'status' in err)) {
      throw err;
    }
    throw createError({
      status: 500,
      statusText: `Failed to retrieve template: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }
});

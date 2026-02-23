import { requireAdmin, readValidatedBodyWithLimit, BODY_SIZE_LIMITS } from '#server/utils/security';
import { renderEmailTemplate } from '#server/utils/email-templates';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { emailTemplatePreviewSchema } from '#shared/schema/admin/settings';

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
    emailTemplatePreviewSchema,
    BODY_SIZE_LIMITS.MEDIUM,
  );

  try {
    const isPlaceholderMode = Object.values(body.data).some(
      (val) => typeof val === 'string' && val.match(/^\{\{\s*\w+\s*\}\}$/),
    );

    let templateHtml: string;
    if (isPlaceholderMode) {
      const { getTemplate } = await import('#server/utils/email-templates');
      const templateData = await getTemplate(id);
      templateHtml = templateData.html;
    } else {
      const templateData = body.data as Record<
        string,
        string | number | boolean | null | undefined
      >;
      const template = await renderEmailTemplate(id, templateData);
      templateHtml = template.html;
    }

    const appName = body.data.appName || 'XyraPanel';

    const styledHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #374151;
            background: #f9fafb;
            padding: 40px 20px;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            overflow: hidden;
          }
          .header { 
            padding: 24px 32px;
            border-bottom: 1px solid #e5e7eb;
          }
          .header-name {
            font-size: 14px;
            font-weight: 600;
            color: #1f2937;
            letter-spacing: 0.5px;
          }
          .content { 
            padding: 32px;
          }
          .footer { 
            padding: 24px 32px;
            border-top: 1px solid #e5e7eb;
            background: #f9fafb;
            text-align: center;
            font-size: 11px;
            color: #6b7280;
            line-height: 1.5;
          }
          h1 { font-size: 24px; color: #1f2937; margin-bottom: 16px; font-weight: 700; }
          h2 { font-size: 18px; color: #1f2937; margin-bottom: 12px; font-weight: 600; }
          h3 { font-size: 14px; color: #1f2937; margin-bottom: 12px; font-weight: 600; }
          p { margin-bottom: 16px; }
          ul, ol { margin-bottom: 16px; margin-left: 20px; }
          li { margin-bottom: 8px; }
          a { color: #1f2937; text-decoration: underline; }
          a:hover { opacity: 0.8; }
          .button { 
            display: inline-block;
            padding: 10px 24px;
            background: #1f2937;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 16px 0;
            font-size: 14px;
            font-weight: 500;
          }
          .button:hover { background: #111827; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="header-name">${appName}</div>
          </div>
          <div class="content">
            ${templateHtml}
          </div>
        </div>
      </body>
      </html>
    `;

    await recordAuditEventFromRequest(event, {
      actor: session.user.email || session.user.id,
      actorType: 'user',
      action: 'admin.email_template.previewed',
      targetType: 'settings',
      metadata: {
        templateId: id,
        placeholderMode: isPlaceholderMode,
      },
    });

    return {
      data: {
        id,
        subject: '',
        html: styledHtml,
      },
    };
  } catch (err) {
    throw createError({
      status: 500,
      statusText: `Failed to render template: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }
});

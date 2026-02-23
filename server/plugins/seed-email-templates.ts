import { randomUUID } from 'node:crypto';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { defaultEmailTemplates } from '#server/utils/default-email-templates';

export default defineNitroPlugin(async () => {
  try {
    const db = useDrizzle();
    const created: string[] = [];

    for (const template of defaultEmailTemplates) {
      const existing = await db.query.emailTemplates.findFirst({
        where: (t, { eq }) => eq(t.templateId, template.id),
        columns: { id: true },
      });

      if (existing) continue;

      const now = new Date();
      await db.insert(tables.emailTemplates).values({
        id: randomUUID(),
        name: template.name,
        templateId: template.id,
        subject: template.subject,
        htmlContent: template.html,
        isCustom: false,
        createdAt: now,
        updatedAt: now,
      });

      created.push(template.id);
    }

    if (created.length > 0) {
      console.log(
        `[email-templates] Seeded ${created.length} default template(s): ${created.join(', ')}`,
      );
    }
  } catch (error) {
    console.error('[email-templates] Failed to seed default templates:', error);
  }
});

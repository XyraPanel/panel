import { randomUUID } from 'node:crypto';
import { useDrizzle, tables } from '#server/utils/drizzle';
import { defaultEmailTemplates } from '#server/utils/default-email-templates';

export default defineTask({
  meta: {
    name: 'db:seed-email-templates',
    description: 'Seed default email templates',
  },
  async run() {
    console.log('Seeding email templates...');
    const db = useDrizzle();

    const created: string[] = [];
    const skipped: string[] = [];

    for (const template of defaultEmailTemplates) {
      const existing = await db.query.emailTemplates.findFirst({
        where: (t, { eq }) => eq(t.templateId, template.id),
      });

      if (existing) {
        skipped.push(template.id);
        continue;
      }

      const now = new Date().toISOString();
      const insertData = {
        id: randomUUID(),
        name: template.name,
        templateId: template.id,
        subject: template.subject,
        htmlContent: template.html,
        isCustom: false,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(tables.emailTemplates).values(insertData);

      created.push(template.id);
    }

    return {
      result: created.length ? 'created' : 'skipped',
      created,
      skipped,
    };
  },
});

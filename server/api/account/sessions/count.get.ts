import { sql } from 'drizzle-orm';
import { requireAccountUser } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

export default defineEventHandler(async (event) => {
  const { user } = await requireAccountUser(event);
  const db = useDrizzle();

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(tables.sessions)
    .where(eq(tables.sessions.userId, user.id));

  return {
    count: Number(result[0]?.count ?? 0),
  };
});

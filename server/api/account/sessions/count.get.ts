import { sql } from 'drizzle-orm';
import { requireAccountUser } from '#server/utils/security';
import { useDrizzle, tables, eq } from '#server/utils/drizzle';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Count active sessions',
    description: 'Returns the number of active sessions for the authenticated account.',
    responses: {
      '200': {
        description: 'Session count',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { count: { type: 'integer' } } },
          },
        },
      },
      '401': { description: 'Not authenticated' },
    },
  },
});

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

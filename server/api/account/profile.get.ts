import { useDrizzle } from '#server/utils/drizzle';
import { recordAuditEventFromRequest } from '#server/utils/audit';
import { requireAccountUser } from '#server/utils/security';

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'Get account profile',
    description: 'Retrieves the profile information for the authenticated user direct from the database.',
    responses: {
      200: {
        description: 'Account profile retrieved',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    username: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      401: { description: 'Authentication required' },
      404: { description: 'User not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const accountContext = await requireAccountUser(event);
  const sessionUser = accountContext.user;

  const db = useDrizzle();

  const profile = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, sessionUser.id),
    columns: {
      id: true,
      username: true,
      email: true,
      role: true,
    },
  });

  if (!profile) {
    throw createError({ status: 404, message: 'User not found' });
  }

  await recordAuditEventFromRequest(event, {
    actor: sessionUser.id,
    actorType: 'user',
    action: 'account.profile.viewed',
    targetType: 'user',
    targetId: sessionUser.id,
  });

  return { data: profile };
});
